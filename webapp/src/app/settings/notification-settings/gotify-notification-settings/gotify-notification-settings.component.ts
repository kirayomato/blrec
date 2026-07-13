import {
  Component,
  OnInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';

import pick from 'lodash-es/pick';

import {
  KEYS_OF_MESSAGE_TEMPLATE_SETTINGS,
  KEYS_OF_NOTIFICATION_SETTINGS,
  KEYS_OF_NOTIFIER_SETTINGS,
  KEYS_OF_GOTIFY_SETTINGS,
  MessageTemplateSettings,
  NotificationSettings,
  NotifierSettings,
  GotifyNotificationSettings,
  GotifySettings,
} from '../../shared/setting.model';

@Component({
  selector: 'app-gotify-notification-settings',
  templateUrl: './gotify-notification-settings.component.html',
  styleUrls: ['./gotify-notification-settings.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GotifyNotificationSettingsComponent implements OnInit {
  gotifySettings!: GotifySettings;
  notifierSettings!: NotifierSettings;
  notificationSettings!: NotificationSettings;
  messageTemplateSettings!: MessageTemplateSettings;

  constructor(
    private changeDetector: ChangeDetectorRef,
    private route: ActivatedRoute
  ) { }

  ngOnInit(): void {
    this.route.data.subscribe((data) => {
      const settings = data.settings as GotifyNotificationSettings;
      this.gotifySettings = pick(settings, KEYS_OF_GOTIFY_SETTINGS);
      this.notifierSettings = pick(settings, KEYS_OF_NOTIFIER_SETTINGS);
      this.notificationSettings = pick(settings, KEYS_OF_NOTIFICATION_SETTINGS);
      this.messageTemplateSettings = pick(
        settings,
        KEYS_OF_MESSAGE_TEMPLATE_SETTINGS
      );
      this.changeDetector.markForCheck();
    });
  }
}
