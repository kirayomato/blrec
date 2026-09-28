import {
  Component,
  OnChanges,
  ChangeDetectionStrategy,
  Input,
  Output,
  EventEmitter,
  ChangeDetectorRef,
  ViewChild,
} from '@angular/core';
import { NgForm } from '@angular/forms';
import { NzModalService } from 'ng-zorro-antd/modal';

import cloneDeep from 'lodash-es/cloneDeep';

import type { Mutable } from '../../shared/utility-types';
import { difference } from '../../shared/utils';
import {
  TaskOptions,
  GlobalTaskSettings,
  TaskOptionsIn,
} from '../../settings/shared/setting.model';
import {
  PATH_TEMPLATE_PATTERN,
  STREAM_FORMAT_OPTIONS,
  QUALITY_OPTIONS,
  TIMEOUT_OPTIONS,
  DISCONNECTION_TIMEOUT_OPTIONS,
  BUFFER_OPTIONS,
  DELETE_STRATEGIES,
  COVER_SAVE_STRATEGIES,
  RECORDING_MODE_OPTIONS,
} from '../../settings/shared/constants/form';

type OptionsModel = NonNullable<TaskOptions>;

@Component({
  selector: 'app-task-settings-dialog',
  templateUrl: './task-settings-dialog.component.html',
  styleUrls: ['./task-settings-dialog.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TaskSettingsDialogComponent implements OnChanges {
  @Input() taskOptions!: Readonly<TaskOptions>;
  @Input() globalSettings!: Readonly<GlobalTaskSettings>;
  @Input() visible = false;

  @Output() visibleChange = new EventEmitter<boolean>();
  @Output() confirm = new EventEmitter<TaskOptionsIn>();
  @Output() afterOpen = new EventEmitter<undefined>();
  @Output() afterClose = new EventEmitter<undefined>();

  @ViewChild(NgForm)
  ngForm?: NgForm;

  readonly warningTip =
    '需要重启弹幕客户端才能生效，如果任务正在录制可能会丢失弹幕！';
  readonly pathTemplatePattern = PATH_TEMPLATE_PATTERN;
  readonly streamFormatOptions = cloneDeep(STREAM_FORMAT_OPTIONS) as Mutable<
    typeof STREAM_FORMAT_OPTIONS
  >;
  readonly recordingModeOptions = cloneDeep(RECORDING_MODE_OPTIONS) as Mutable<
    typeof RECORDING_MODE_OPTIONS
  >;
  readonly fmp4StreamTimeoutOptions = cloneDeep(TIMEOUT_OPTIONS) as Mutable<
    typeof TIMEOUT_OPTIONS
  >;
  readonly qualityOptions = cloneDeep(QUALITY_OPTIONS) as Mutable<
    typeof QUALITY_OPTIONS
  >;
  readonly readTimeoutOptions = cloneDeep(TIMEOUT_OPTIONS) as Mutable<
    typeof TIMEOUT_OPTIONS
  >;
  readonly disconnectionTimeoutOptions = cloneDeep(
    DISCONNECTION_TIMEOUT_OPTIONS
  ) as Mutable<typeof DISCONNECTION_TIMEOUT_OPTIONS>;
  readonly bufferOptions = cloneDeep(BUFFER_OPTIONS) as Mutable<
    typeof BUFFER_OPTIONS
  >;
  readonly deleteStrategies = cloneDeep(DELETE_STRATEGIES) as Mutable<
    typeof DELETE_STRATEGIES
  >;
  readonly coverSaveStrategies = cloneDeep(COVER_SAVE_STRATEGIES) as Mutable<
    typeof COVER_SAVE_STRATEGIES
  >;

  model!: OptionsModel;
  options!: TaskOptions;

  constructor(
    private changeDetector: ChangeDetectorRef,
    private modal: NzModalService
  ) {}

  ngOnChanges(): void {
    this.options = cloneDeep(this.taskOptions);
    this.setupModel();
    this.changeDetector.markForCheck();
  }

  close(): void {
    this.setVisible(false);
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    this.visibleChange.emit(visible);
    this.changeDetector.markForCheck();
  }

  handleCancel(): void {
    const hasChanges =
      Object.keys(difference(this.options, this.taskOptions!)).length > 0;
    if (hasChanges) {
      this.modal.confirm({
        nzTitle: '设置尚未保存',
        nzContent: '关闭将放弃未保存的修改，确定关闭？',
        nzOnOk: () => this.close(),
      });
    } else {
      this.close();
    }
  }

  handleConfirm(): void {
    this.confirm.emit(difference(this.options, this.taskOptions!));
    this.close();
  }

  private setupModel(): void {
    const model = {};
    // 保存限制只有任务级配置，字段缺省（null）时显示为 0（不限制）
    const groupDefaults: Partial<Record<keyof TaskOptions, object>> = {
      retention: { maxKeepDays: 0, maxKeepSize: 0 },
    };

    for (const key of Object.keys(this.options)) {
      const prop = key as keyof TaskOptions;
      const options = this.options[prop];
      const groupSettings = this.globalSettings[
        prop as keyof GlobalTaskSettings
      ];
      const defaults = groupDefaults[prop];
      Reflect.set(
        model,
        prop,
        new Proxy(options, {
          get: (target, prop) => {
            const globalValue =
              groupSettings != null
                ? Reflect.get(groupSettings, prop)
                : undefined;
            const defaultValue =
              defaults != null ? Reflect.get(defaults, prop) : undefined;
            return (
              Reflect.get(target, prop) ?? globalValue ?? defaultValue
            );
          },
          set: (target, prop, value) => {
            return Reflect.set(target, prop, value);
          },
        })
      );
    }

    this.model = model as OptionsModel;
  }
}
