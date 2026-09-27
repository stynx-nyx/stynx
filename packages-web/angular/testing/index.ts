import { HttpErrorResponse, HttpEventType, HttpHeaders, HttpResponse } from '@angular/common/http';
import type { HttpContext, HttpEvent } from '@angular/common/http';
import { Observable, Subject } from 'rxjs';
import type { StynxEventStreamClock, StynxEventStreamTransport } from '@stynx-nyx/angular';

interface FakeConnection {
  request: { url: string; lastEventId: string | null; context: HttpContext };
  subject: Subject<HttpEvent<string>>;
  cumulative: string;
  cancelled: boolean;
}

/** Controlled transport for progress, HTTP response, error and close paths. */
export class FakeStynxEventStreamTransport implements StynxEventStreamTransport {
  readonly connections: FakeConnection[] = [];

  connect(request: { url: string; lastEventId: string | null; context: HttpContext }): Observable<HttpEvent<string>> {
    const connection: FakeConnection = { request, subject: new Subject<HttpEvent<string>>(), cumulative: '', cancelled: false };
    this.connections.push(connection);
    return new Observable<HttpEvent<string>>((subscriber) => {
      const subscription = connection.subject.subscribe(subscriber);
      return () => { connection.cancelled = true; subscription.unsubscribe(); };
    });
  }

  lastRequest(): FakeConnection['request'] {
    return this.current().request;
  }

  emitProgress(chunk: string): void {
    const connection = this.current();
    connection.cumulative += chunk;
    connection.subject.next({ type: HttpEventType.DownloadProgress, loaded: connection.cumulative.length, partialText: connection.cumulative });
  }

  respond(status: number, headers: Record<string, string> = {}): void {
    this.current().subject.next(new HttpResponse<string>({ status, headers: new HttpHeaders(headers), body: '' }));
    this.current().subject.complete();
  }

  error(status: number, headers: Record<string, string> = {}): void {
    this.current().subject.error(new HttpErrorResponse({ status, headers: new HttpHeaders(headers), statusText: 'Fake stream error' }));
  }

  close(): void { this.current().subject.complete(); }
  cancelled(): boolean { return this.current().cancelled; }

  private current(): FakeConnection {
    const connection = this.connections[this.connections.length - 1];
    if (!connection) throw new Error('No stream request');
    return connection;
  }
}

interface Task { at: number; period?: number; fn: () => void; cancelled: boolean }

/** Deterministic clock: callbacks run in chronological order during advanceBy. */
export class FakeStynxEventStreamClock implements StynxEventStreamClock {
  private time = 0;
  private tasks: Task[] = [];
  now(): number { return this.time; }
  setTimeout(fn: () => void, delayMs: number): { cancel(): void } { return this.schedule(fn, delayMs); }
  setInterval(fn: () => void, periodMs: number): { cancel(): void } { return this.schedule(fn, periodMs, periodMs); }
  private schedule(fn: () => void, delayMs: number, period?: number): { cancel(): void } {
    const task: Task = { at: this.time + delayMs, fn, cancelled: false };
    if (period !== undefined) task.period = period;
    this.tasks.push(task);
    return { cancel: () => { task.cancelled = true; } };
  }
  nextTimeoutDelay(): number | null {
    const next = this.tasks.filter((task) => !task.cancelled && task.period === undefined).sort((a, b) => a.at - b.at)[0];
    return next ? next.at - this.time : null;
  }
  advanceBy(milliseconds: number): void {
    const end = this.time + milliseconds;
    while (true) {
      const next = this.tasks.filter((task) => !task.cancelled && task.at <= end).sort((a, b) => a.at - b.at)[0];
      if (!next) break;
      this.time = next.at;
      if (next.period === undefined) next.cancelled = true;
      else next.at += next.period;
      next.fn();
    }
    this.time = end;
    this.tasks = this.tasks.filter((task) => !task.cancelled);
  }
}
