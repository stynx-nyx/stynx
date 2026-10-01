import '@angular/compiler';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { StynxEventStreamService, provideStynxEventStream } from '@stynx-nyx/angular';
import { FakeStynxEventStreamClock, FakeStynxEventStreamTransport } from '@stynx-nyx/angular/testing';

beforeAll(() => TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting()));
afterEach(() => TestBed.resetTestingModule());

function setup() {
  const clock = new FakeStynxEventStreamClock();
  const transport = new FakeStynxEventStreamTransport();
  TestBed.configureTestingModule({ providers: [
    provideStynxEventStream({ url: '/stream', pollingIntervalMs: 60_000, sessionActive: signal(true).asReadonly(), transport, clock }),
  ] });
  return { stream: TestBed.inject(StynxEventStreamService), clock, transport };
}

describe('event stream Retry-After when entering polling', () => {
  it('waits for Retry-After seconds when a 429 is the failure that enters polling', () => {
    const { stream, clock, transport } = setup();
    stream.start();
    transport.error(500);
    clock.advanceBy(1_000);
    expect(transport.connections).toHaveLength(2);
    transport.error(429, { 'Retry-After': '7' });
    expect(stream.polling()).toBe(true);
    expect(transport.connections).toHaveLength(2);
    expect(clock.nextTimeoutDelay()).toBe(7_000);
    clock.advanceBy(6_999);
    expect(transport.connections).toHaveLength(2);
    clock.advanceBy(1);
    expect(transport.connections).toHaveLength(3);
  });

  it('waits for a Retry-After date when a 429 is the failure that enters polling', () => {
    const { stream, clock, transport } = setup();
    stream.start();
    transport.error(503);
    clock.advanceBy(1_000);
    transport.error(429, { 'Retry-After': new Date(clock.now() + 9_000).toUTCString() });
    expect(stream.polling()).toBe(true);
    expect(transport.connections).toHaveLength(2);
    expect(clock.nextTimeoutDelay()).toBeGreaterThanOrEqual(8_000);
  });

  it('still reopens immediately when entering polling without Retry-After', () => {
    const { stream, clock, transport } = setup();
    stream.start();
    transport.error(500);
    clock.advanceBy(1_000);
    transport.error(429);
    expect(stream.polling()).toBe(true);
    expect(transport.connections).toHaveLength(3);
  });
});
