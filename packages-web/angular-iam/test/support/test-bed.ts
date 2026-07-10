import '@angular/compiler';
import type { EnvironmentProviders, Provider, Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { ComponentFixture } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { StynxI18nService } from '@stynx-nyx/angular-i18n';
import { StynxToastService } from '@stynx-nyx/angular-ui';
import { afterEach } from 'vitest';
import { IamApiService } from '../../src/iam-api.service';
import { FakeIamApi, FakeI18nService, FakeToastService } from './fixtures';

let initialized = false;

function initAngularTestEnvironment(): void {
  if (initialized) return;
  initialized = true;
  try {
    TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
  } catch (error) {
    if (!String(error).includes('Cannot set base providers')) {
      throw error;
    }
  }
}

export async function renderComponent<T extends object>(
  Component: Type<T>,
  options: { inputs?: Partial<T>; providers?: Array<EnvironmentProviders | Provider> } = {},
): Promise<ComponentFixture<T>> {
  initAngularTestEnvironment();
  await TestBed.configureTestingModule({
    imports: [Component],
    providers: [
      { provide: IamApiService, useClass: FakeIamApi },
      { provide: StynxI18nService, useClass: FakeI18nService },
      { provide: StynxToastService, useClass: FakeToastService },
      ...(options.providers ?? []),
    ],
  }).compileComponents();

  const fixture = TestBed.createComponent(Component);
  if (options.inputs) {
    Object.assign(fixture.componentInstance, options.inputs);
  }
  fixture.detectChanges();
  return fixture;
}

afterEach(() => {
  TestBed.resetTestingModule();
});
