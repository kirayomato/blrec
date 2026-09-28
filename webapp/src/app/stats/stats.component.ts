import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnInit,
} from '@angular/core';

import { NzNotificationService } from 'ng-zorro-antd/notification';
import { NzTableSortFn, NzTableSortOrder } from 'ng-zorro-antd/table';

import { StatsService } from './shared/services/stats.service';
import {
  MonthStatsRow,
  RecordingStats,
  RoomStatsRow,
} from './shared/stats.model';

@Component({
  selector: 'app-stats',
  templateUrl: './stats.component.html',
  styleUrls: ['./stats.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StatsComponent implements OnInit {
  loading = true;
  stats: RecordingStats = {
    out_dir: '',
    file_count: 0,
    total_size: 0,
    first_time: null,
    last_time: null,
    rooms: [],
    monthly: [],
  };
  rows: RoomStatsRow[] = [];
  monthRows: MonthStatsRow[] = [];
  expandedRooms = new Set<string>();

  // 取消排序时回到后端给出的默认顺序（按体积降序）
  readonly sortDirections: NzTableSortOrder[] = ['ascend', 'descend', null];

  sortByName: NzTableSortFn<RoomStatsRow> = (a, b) =>
    a.name.localeCompare(b.name);
  sortByCount: NzTableSortFn<RoomStatsRow> = (a, b) => a.fileCount - b.fileCount;
  sortBySize: NzTableSortFn<RoomStatsRow> = (a, b) => a.totalSize - b.totalSize;
  sortByFirstTime: NzTableSortFn<RoomStatsRow> = (a, b) =>
    (a.firstTime ?? 0) - (b.firstTime ?? 0);
  sortByLastTime: NzTableSortFn<RoomStatsRow> = (a, b) =>
    (a.lastTime ?? 0) - (b.lastTime ?? 0);
  sortByPercent: NzTableSortFn<RoomStatsRow> = (a, b) =>
    a.percent - b.percent;

  sortByMonth: NzTableSortFn<MonthStatsRow> = (a, b) =>
    a.month.localeCompare(b.month);
  sortByMonthCount: NzTableSortFn<MonthStatsRow> = (a, b) =>
    a.fileCount - b.fileCount;
  sortByMonthSize: NzTableSortFn<MonthStatsRow> = (a, b) =>
    a.totalSize - b.totalSize;
  sortByMonthPercent: NzTableSortFn<MonthStatsRow> = (a, b) =>
    a.percent - b.percent;

  constructor(
    private changeDetector: ChangeDetectorRef,
    private notification: NzNotificationService,
    private statsService: StatsService
  ) {}

  ngOnInit(): void {
    this.refresh();
  }

  refresh(): void {
    this.loading = true;
    this.changeDetector.markForCheck();

    this.statsService.getRecordingStats().subscribe(
      (stats) => {
        this.loading = false;
        this.stats = stats;
        this.rows = this.makeRows(stats);
        this.monthRows = this.makeMonthRows(stats);
        this.changeDetector.markForCheck();
      },
      (error: HttpErrorResponse) => {
        this.loading = false;
        this.changeDetector.markForCheck();
        this.notification.error('获取录像统计出错', error.message);
      }
    );
  }

  onExpandChange(name: string, expanded: boolean): void {
    if (expanded) {
      this.expandedRooms.add(name);
    } else {
      this.expandedRooms.delete(name);
    }
    this.changeDetector.markForCheck();
  }

  trackByName(index: number, row: RoomStatsRow): string {
    return row.name;
  }

  trackByMonth(index: number, row: MonthStatsRow): string {
    return row.month;
  }

  private makeRows(stats: RecordingStats): RoomStatsRow[] {
    return stats.rooms.map((room) => ({
      // 直接放在输出目录下的录像没有房间目录，单独标记出来
      name: room.name || '(根目录)',
      fileCount: room.file_count,
      totalSize: room.total_size,
      firstTime: toMilliseconds(room.first_time),
      lastTime: toMilliseconds(room.last_time),
      percent:
        stats.total_size > 0 ? (room.total_size / stats.total_size) * 100 : 0,
      monthly: room.monthly.map((month) => ({
        month: month.month,
        fileCount: month.file_count,
        totalSize: month.total_size,
      })),
    }));
  }

  private makeMonthRows(stats: RecordingStats): MonthStatsRow[] {
    return stats.monthly.map((month) => ({
      month: month.month,
      fileCount: month.file_count,
      totalSize: month.total_size,
      percent:
        stats.total_size > 0 ? (month.total_size / stats.total_size) * 100 : 0,
    }));
  }
}

function toMilliseconds(time: number | null): number | null {
  return time !== null ? time * 1000 : null;
}
