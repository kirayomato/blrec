import {
  Component,
  OnInit,
  ChangeDetectionStrategy,
  Input,
  OnChanges,
  ChangeDetectorRef,
} from '@angular/core';
import {
  FormBuilder,
  FormControl,
  FormGroup,
  Validators,
} from '@angular/forms';

import { Observable } from 'rxjs';
import mapValues from 'lodash-es/mapValues';

import { CookieLoginInfo, HeaderSettings } from '../shared/setting.model';
import {
  SettingsSyncService,
  SyncStatus,
  calcSyncStatus,
} from '../shared/services/settings-sync.service';
import { SYNC_FAILED_WARNING_TIP } from '../shared/constants/form';

@Component({
  selector: 'app-header-settings',
  templateUrl: './header-settings.component.html',
  styleUrls: ['./header-settings.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HeaderSettingsComponent implements OnInit, OnChanges {
  @Input() settings!: HeaderSettings;
  syncStatus!: SyncStatus<HeaderSettings>;

  readonly settingsForm: FormGroup;
  readonly syncFailedWarningTip = SYNC_FAILED_WARNING_TIP;

  cookieUpdatedAt?: number | null;
  loginInfo?: CookieLoginInfo | null;

  constructor(
    formBuilder: FormBuilder,
    private changeDetector: ChangeDetectorRef,
    private settingsSyncService: SettingsSyncService
  ) {
    this.settingsForm = formBuilder.group({
      userAgent: ['', [Validators.required]],
      cookie: [''],
    });
  }

  get userAgentControl() {
    return this.settingsForm.get('userAgent') as FormControl;
  }

  get cookieControl() {
    return this.settingsForm.get('cookie') as FormControl;
  }

  get cookieUpdatedAtText(): string {
    const updatedAt = this.cookieUpdatedAt;
    if (!updatedAt) {
      return '从未更新';
    }
    return new Date(updatedAt * 1000).toLocaleString('zh-CN', { hour12: false });
  }

  get loginInfoText(): string {
    const loginInfo = this.loginInfo;
    if (!loginInfo) {
      return '无有效登录信息';
    }
    return `${loginInfo.uname} (uid: ${loginInfo.uid})`;
  }

  ngOnChanges(): void {
    this.syncStatus = mapValues(this.settings, () => true);
    // cookieUpdatedAt 与 loginInfo 由服务端写入，不属于表单字段，
    // 因此只能 patch 而不能 setValue。
    this.settingsForm.patchValue({
      userAgent: this.settings.userAgent,
      cookie: this.settings.cookie,
    });
    this.cookieUpdatedAt = this.settings.cookieUpdatedAt;
    this.loginInfo = this.settings.loginInfo;
    this.changeDetector.markForCheck();
  }

  ngOnInit(): void {
    this.settingsSyncService
      .syncSettings(
        'header',
        this.settings,
        this.settingsForm.valueChanges as Observable<HeaderSettings>
      )
      .subscribe((detail) => {
        this.syncStatus = { ...this.syncStatus, ...calcSyncStatus(detail) };
        if ('result' in detail && detail.result) {
          this.cookieUpdatedAt = detail.result.cookieUpdatedAt;
          this.loginInfo = detail.result.loginInfo;
        }
        this.changeDetector.markForCheck();
      });
  }
}
