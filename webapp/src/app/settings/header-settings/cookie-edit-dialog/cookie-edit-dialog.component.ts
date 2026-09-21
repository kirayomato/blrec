import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  QueryList,
  ViewChildren,
} from '@angular/core';
import { FormBuilder, FormControl, FormGroup } from '@angular/forms';

import { NzMessageService } from 'ng-zorro-antd/message';

import { Subscription, timer } from 'rxjs';
import { switchMap, takeWhile, tap } from 'rxjs/operators';

import { QrCodeLoginStatus } from 'src/app/core/models/login.model';
import { LoginService } from 'src/app/core/services/login.service';
import { ValidationService } from 'src/app/core/services/validation.service';
import { ResponseMessage } from 'src/app/shared/api.models';
import { encodeQrMatrix } from 'src/app/shared/qrcode';

const POLL_INTERVAL = 2000;
const QRCODE_MODULE_SIZE = 4;
const QRCODE_LIGHT_COLOR = '#ffffff';
const QRCODE_DARK_COLOR = '#000000';

@Component({
  selector: 'app-cookie-edit-dialog',
  templateUrl: './cookie-edit-dialog.component.html',
  styleUrls: ['./cookie-edit-dialog.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CookieEditDialogComponent implements OnChanges, OnDestroy {
  @Input() value = '';
  @Input() visible = false;
  @Output() visibleChange = new EventEmitter<boolean>();
  @Output() cancel = new EventEmitter<undefined>();
  @Output() confirm = new EventEmitter<string>();

  // The canvas only exists while the login panel is expanded and loaded, so the
  // query has to be re-evaluated whenever that part of the view comes and goes.
  @ViewChildren('qrcodeCanvas')
  qrcodeCanvases?: QueryList<ElementRef<HTMLCanvasElement>>;

  readonly settingsForm: FormGroup;
  readonly warningTip =
    '全部任务都需重启弹幕客户端才能生效，正在录制的任务可能会丢失弹幕！';

  qrcodeVisible = false;
  qrcodeStatus?: QrCodeLoginStatus;
  qrcodeLoginFailed = false;

  private pollingSubscription?: Subscription;
  private qrcodeKey = '';
  private qrcodeUrl = '';

  constructor(
    formBuilder: FormBuilder,
    private changeDetector: ChangeDetectorRef,
    private validationService: ValidationService,
    private loginService: LoginService,
    private message: NzMessageService
  ) {
    this.settingsForm = formBuilder.group({
      cookie: [''],
    });
  }

  get control() {
    return this.settingsForm.get('cookie') as FormControl;
  }

  get qrcodeStatusTip(): string {
    switch (this.qrcodeStatus) {
      case QrCodeLoginStatus.SCANNED:
        return '已扫码，请在手机上确认登录';
      case QrCodeLoginStatus.SUCCEEDED:
        return '登录成功，Cookie 已填入';
      case QrCodeLoginStatus.EXPIRED:
        return '二维码已过期，请重新获取';
      default:
        return '请使用 Bilibili 手机客户端扫描二维码';
    }
  }

  get qrcodeExpired(): boolean {
    return this.qrcodeStatus === QrCodeLoginStatus.EXPIRED;
  }

  get qrcodeLoading(): boolean {
    return this.qrcodeStatus === undefined || this.qrcodeLoginFailed;
  }

  ngOnChanges(): void {
    this.setValue();
  }

  ngOnDestroy(): void {
    this.stopPolling();
  }

  open(): void {
    this.setValue();
    this.setVisible(true);
  }

  close(): void {
    this.stopPolling();
    this.resetQrCode();
    this.setVisible(false);
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    this.visibleChange.emit(visible);
    this.changeDetector.markForCheck();
  }

  setValue(): void {
    this.control.setValue(this.value);
    this.changeDetector.markForCheck();
  }

  handleCancel(): void {
    this.cancel.emit();
    this.close();
  }

  handleConfirm(): void {
    this.confirm.emit(this.control.value.trim());
    this.close();
  }

  testCookie(): void {
    this.validationService
      .validateCookie(this.control.value)
      .subscribe((result) => {
        if (result.code === 0) {
          this.message.success(
            `uid: ${result.data?.mid}, uname: ${result.data?.uname}`
          );
        } else {
          this.message.error(`${result.code}: ${result.message}`);
        }
      });
  }

  toggleQrcode(): void {
    this.qrcodeVisible = !this.qrcodeVisible;
    if (this.qrcodeVisible) {
      this.startQrCodeLogin();
    } else {
      this.stopPolling();
    }
    this.changeDetector.markForCheck();
  }

  refreshQrCode(): void {
    this.startQrCodeLogin();
  }

  private startQrCodeLogin(): void {
    this.stopPolling();
    this.qrcodeStatus = undefined;
    this.qrcodeLoginFailed = false;
    this.qrcodeUrl = '';
    this.changeDetector.markForCheck();

    this.loginService.generateQrCode().subscribe({
      next: (result) => {
        if (result.code !== 0) {
          this.qrcodeLoginFailed = true;
          this.message.error(`${result.code}: ${result.message}`);
          this.changeDetector.markForCheck();
          return;
        }
        this.qrcodeKey = result.data?.qrcode_key;
        this.qrcodeUrl = result.data?.url ?? '';
        this.qrcodeStatus = QrCodeLoginStatus.PENDING;
        // The canvas is created by the status change above, so it is only
        // available after the view has been updated.
        this.changeDetector.detectChanges();
        this.renderQrCode();
        this.changeDetector.markForCheck();
        this.startPolling();
      },
      error: (error) => {
        this.qrcodeLoginFailed = true;
        this.message.error(`获取二维码出错: ${error.message}`);
        this.changeDetector.markForCheck();
      },
    });
  }

  private startPolling(): void {
    this.pollingSubscription = timer(0, POLL_INTERVAL)
      .pipe(
        switchMap(() => this.loginService.pollQrCode(this.qrcodeKey)),
        tap((result) =>
          console.log(
            `[qrcode] ${new Date().toISOString()} code=${result.code} status=${
              result.data?.status
            } cookie=${result.data?.cookie ? 'yes' : 'no'} msg=${result.message}`
          )
        ),
        // Polling stops as soon as the login reaches a final state.
        takeWhile((result) => this.shouldKeepPolling(result), true)
      )
      .subscribe({
        next: (result) => {
          if (result.code < 0) {
            this.qrcodeLoginFailed = true;
            this.message.error(
              result.message || '登录成功但未获取到 Cookie，请重试'
            );
            this.changeDetector.markForCheck();
            return;
          }
          // A transient failure is not fatal, the next tick retries.
          if (result.code !== 0) {
            return;
          }
          const status = result.data?.status as QrCodeLoginStatus;
          this.qrcodeStatus = status;
          if (status === QrCodeLoginStatus.SUCCEEDED) {
            this.control.setValue(result.data?.cookie ?? '');
            this.message.success('登录成功，Cookie 已填入');
          }
          this.changeDetector.markForCheck();
        },
        error: (error) => {
          this.qrcodeLoginFailed = true;
          this.message.error(`轮询扫码状态出错: ${error.message}`);
          this.changeDetector.markForCheck();
        },
      });
  }

  /**
   * Whether the poll loop should keep running after receiving ``result``.
   *
   * ``succeeded`` and ``expired`` are final states. A negative code reports a
   * login that succeeded without yielding credentials, which is final too --
   * retrying it only makes the user wait for the QR code to expire.
   */
  private shouldKeepPolling(result: ResponseMessage): boolean {
    if (result.code < 0) {
      return false;
    }
    // Errors without a status are transient and worth retrying.
    if (result.code !== 0) {
      return true;
    }
    return (
      result.data?.status !== QrCodeLoginStatus.SUCCEEDED &&
      result.data?.status !== QrCodeLoginStatus.EXPIRED
    );
  }

  private stopPolling(): void {
    if (this.pollingSubscription) {
      this.pollingSubscription.unsubscribe();
      this.pollingSubscription = undefined;
    }
  }

  private resetQrCode(): void {
    this.qrcodeVisible = false;
    this.qrcodeStatus = undefined;
    this.qrcodeLoginFailed = false;
    this.qrcodeKey = '';
    this.qrcodeUrl = '';
  }

  private renderQrCode(): void {
    const canvas = this.qrcodeCanvases?.first?.nativeElement;
    if (!this.qrcodeUrl || !canvas) {
      return;
    }
    const matrix = encodeQrMatrix(this.qrcodeUrl);
    const context = canvas.getContext('2d');
    if (!context) {
      return;
    }
    const size = matrix.length;
    canvas.width = size * QRCODE_MODULE_SIZE;
    canvas.height = size * QRCODE_MODULE_SIZE;
    context.fillStyle = QRCODE_LIGHT_COLOR;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = QRCODE_DARK_COLOR;
    for (let row = 0; row < size; row++) {
      for (let col = 0; col < size; col++) {
        if (matrix[row][col]) {
          context.fillRect(
            col * QRCODE_MODULE_SIZE,
            row * QRCODE_MODULE_SIZE,
            QRCODE_MODULE_SIZE,
            QRCODE_MODULE_SIZE
          );
        }
      }
    }
  }
}
