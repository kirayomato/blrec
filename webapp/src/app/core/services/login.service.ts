import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';

import { Observable } from 'rxjs';

import { ResponseMessage } from 'src/app/shared/api.models';
import { UrlService } from './url.service';

@Injectable({
  providedIn: 'root',
})
export class LoginService {
  constructor(private http: HttpClient, private url: UrlService) {}

  generateQrCode(): Observable<ResponseMessage> {
    const url = this.url.makeApiUrl(`/api/v1/login/qrcode/generate`);
    return this.http.get<ResponseMessage>(url);
  }

  pollQrCode(qrcodeKey: string): Observable<ResponseMessage> {
    const url = this.url.makeApiUrl(`/api/v1/login/qrcode/poll`);
    return this.http.get<ResponseMessage>(url, { params: { qrcodeKey } });
  }
}
