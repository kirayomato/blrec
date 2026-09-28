import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';

import { Observable } from 'rxjs';

import { UrlService } from '../../../core/services/url.service';
import { RecordingStats } from '../stats.model';

@Injectable({
  providedIn: 'root',
})
export class StatsService {
  constructor(private http: HttpClient, private url: UrlService) {}

  getRecordingStats(): Observable<RecordingStats> {
    const url = this.url.makeApiUrl('/api/v1/recordings/stats');
    return this.http.get<RecordingStats>(url);
  }
}
