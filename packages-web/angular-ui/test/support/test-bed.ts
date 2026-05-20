import type { Provider, Type } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';

export interface RenderComponentOptions<T extends object> {
  imports?: unknown[];
  inputs?: Partial<T>;
  providers?: Provider[];
}

export async function renderComponent<T extends object>(
  Component: Type<T>,
  options: RenderComponentOptions<T> = {},
): Promise<ComponentFixture<T>> {
  TestBed.resetTestingModule();
  await TestBed.configureTestingModule({
    imports: [Component, ...((options.imports ?? []) as never[])],
    providers: options.providers ?? [],
  }).compileComponents();

  const fixture = TestBed.createComponent(Component);
  if (options.inputs) {
    Object.assign(fixture.componentInstance, options.inputs);
  }
  fixture.detectChanges();
  return fixture;
}
