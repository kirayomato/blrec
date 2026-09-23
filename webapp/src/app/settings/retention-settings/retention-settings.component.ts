import {
  Component,
  OnInit,
  ChangeDetectionStrategy,
  Input,
  OnChanges,
  ChangeDetectorRef,
} from '@angular/core';
import { FormBuilder, FormControl, FormGroup } from '@angular/forms';

import { Observable } from 'rxjs';
import mapValues from 'lodash-es/mapValues';

import { RetentionSettings } from '../shared/setting.model';
import {
  SettingsSyncService,
  SyncStatus,
  calcSyncStatus,
} from '../shared/services/settings-sync.service';
import { SYNC_FAILED_WARNING_TIP } from '../shared/constants/form';

@Component({
  selector: 'app-retention-settings',
  templateUrl: './retention-settings.component.html',
  styleUrls: ['./retention-settings.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RetentionSettingsComponent implements OnInit, OnChanges {
  @Input() settings!: RetentionSettings;
  syncStatus!: SyncStatus<RetentionSettings>;

  readonly settingsForm: FormGroup;
  readonly syncFailedWarningTip = SYNC_FAILED_WARNING_TIP;

  readonly maxKeepDaysTip = `超过指定天数的录播自动删除
设置为 0 表示不限制
删除遵循空间回收的保留规则：弹幕文件不删，低码率竖屏录像保留`;

  readonly maxKeepSizeTip = `各房间录播总占用超过限制时从最旧的开始自动删除
格式：数字 + 可选单位(GB, MB, KB, B)
省略单位时按 GB 计算
不限制设置为 0 B`;

  constructor(
    formBuilder: FormBuilder,
    private changeDetector: ChangeDetectorRef,
    private settingsSyncService: SettingsSyncService
  ) {
    this.settingsForm = formBuilder.group({
      maxKeepDays: [''],
      maxKeepSize: [''],
    });
  }

  get maxKeepDaysControl() {
    return this.settingsForm.get('maxKeepDays') as FormControl;
  }

  get maxKeepSizeControl() {
    return this.settingsForm.get('maxKeepSize') as FormControl;
  }

  ngOnChanges(): void {
    this.syncStatus = mapValues(this.settings, () => true);
    this.settingsForm.setValue(this.settings);
  }

  ngOnInit(): void {
    this.settingsSyncService
      .syncSettings(
        'retention',
        this.settings,
        this.settingsForm.valueChanges as Observable<RetentionSettings>
      )
      .subscribe((detail) => {
        this.syncStatus = { ...this.syncStatus, ...calcSyncStatus(detail) };
        this.changeDetector.markForCheck();
      });
  }
}
