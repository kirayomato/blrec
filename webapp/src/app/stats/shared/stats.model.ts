export interface MonthlyStats {
  readonly month: string;
  readonly file_count: number;
  readonly total_size: number;
}

export interface RoomRecordingStats {
  readonly name: string;
  readonly file_count: number;
  readonly total_size: number;
  readonly first_time: number | null;
  readonly last_time: number | null;
  readonly monthly: MonthlyStats[];
}

export interface RecordingStats {
  readonly out_dir: string;
  readonly file_count: number;
  readonly total_size: number;
  readonly first_time: number | null;
  readonly last_time: number | null;
  readonly rooms: RoomRecordingStats[];
  readonly monthly: MonthlyStats[];
}

/** 房间行展开后显示的按月明细。 */
export interface RoomMonthStatsRow {
  month: string;
  fileCount: number;
  totalSize: number;
}

/** 房间表格的行，时间已由秒换算成毫秒。 */
export interface RoomStatsRow {
  name: string;
  fileCount: number;
  totalSize: number;
  firstTime: number | null;
  lastTime: number | null;
  percent: number;
  monthly: RoomMonthStatsRow[];
}

/** 全部房间按月汇总表格的行。 */
export interface MonthStatsRow {
  month: string;
  fileCount: number;
  totalSize: number;
  percent: number;
}
