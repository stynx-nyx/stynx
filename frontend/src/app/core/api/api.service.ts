import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '@env/environment';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly baseUrl = environment.apiBaseUrl;

  constructor(private readonly http: HttpClient) {}

  get<T>(path: string, options?: object): Observable<T> {
    return this.http.get<T>(`${this.baseUrl}${path}`, options);
  }

  post<T>(path: string, body: unknown, options?: object): Observable<T> {
    return this.http.post<T>(`${this.baseUrl}${path}`, body, options);
  }

  delete<T>(path: string, options?: object): Observable<T> {
    return this.http.delete<T>(`${this.baseUrl}${path}`, options);
  }
}
