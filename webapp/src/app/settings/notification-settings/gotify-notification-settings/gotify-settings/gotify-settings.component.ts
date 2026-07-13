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

import mapValues from 'lodash-es/mapValues';

import { GotifySettings } from '../../../shared/setting.model';
import { filterValueChanges } from '../../../shared/rx-operators';
import {
  SettingsSyncService,
  SyncStatus,
  calcSyncStatus,
} from '../../../shared/services/settings-sync.service';
import { SYNC_FAILED_WARNING_TIP } from 'src/app/settings/shared/constants/form';

@Component({
  selector: 'app-gotify-settings',
  templateUrl: './gotify-settings.component.html',
  styleUrls: ['./gotify-settings.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GotifySettingsComponent implements OnInit, OnChanges {
  @Input() settings!: GotifySettings;
  syncStatus!: SyncStatus<GotifySettings>;

  readonly settingsForm: FormGroup;
  readonly syncFailedWarningTip = SYNC_FAILED_WARNING_TIP;

  constructor(
    formBuilder: FormBuilder,
    private changeDetector: ChangeDetectorRef,
    private settingsSyncService: SettingsSyncService
  ) {
    this.settingsForm = formBuilder.group({
      gotifyUrl: ['', [Validators.pattern(/^https?:\/\/.+/)]],
      gotifyToken: ['', [Validators.required]],
    });
  }

  get gotifyUrlControl() {
    return this.settingsForm.get('gotifyUrl') as FormControl;
  }

  get gotifyTokenControl() {
    return this.settingsForm.get('gotifyToken') as FormControl;
  }

  ngOnChanges(): void {
    this.syncStatus = mapValues(this.settings, () => true);
    this.settingsForm.setValue(this.settings);
  }

  ngOnInit(): void {
    this.settingsSyncService
      .syncSettings(
        'gotifyNotification',
        this.settings,
        this.settingsForm.valueChanges.pipe(
          filterValueChanges<Partial<GotifySettings>>(this.settingsForm)
        )
      )
      .subscribe((detail) => {
        this.syncStatus = { ...this.syncStatus, ...calcSyncStatus(detail) };
        this.changeDetector.markForCheck();
      });
  }
}
