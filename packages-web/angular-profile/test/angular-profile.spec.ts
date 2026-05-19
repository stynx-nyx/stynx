import '@angular/compiler';
import { Injector, runInInjectionContext } from '@angular/core';
import { FormBuilder } from '@angular/forms';
import { StynxPreferencesFormComponent } from '../src/preferences-form.component';
import { StynxProfileFormComponent } from '../src/profile-form.component';

function createWithFormBuilder<T>(factory: () => T): T {
  const injector = Injector.create({
    providers: [{ provide: FormBuilder, useValue: new FormBuilder() }],
  });
  return runInInjectionContext(injector, factory);
}

describe('@stynx-web/angular-profile', () => {
  it('validates the profile form and emits only when dirty and valid', () => {
    const component = createWithFormBuilder(() => new StynxProfileFormComponent());
    const seen: unknown[] = [];
    component.save.subscribe((value) => seen.push(value));
    component.value = null;
    expect(component.form.getRawValue()).toEqual({
      name: '',
      email: '',
      locale: 'en-US',
    });

    component.value = {
      name: 'Ana',
      email: 'ana@example.test',
      locale: 'en-US',
    };
    expect(component.form.dirty).toBe(false);

    component.form.patchValue({
      email: 'invalid',
    });
    component.submit();
    expect(seen).toHaveLength(0);

    component.form.patchValue({
      email: 'ana@example.test',
      locale: 'pt-BR',
    });
    component.form.markAsDirty();
    expect(component.form.dirty).toBe(true);
    component.submit();
    expect(seen).toEqual([
      {
        name: 'Ana',
        email: 'ana@example.test',
        locale: 'pt-BR',
      },
    ]);
  });

  it('tracks dirty state in the preferences form', () => {
    const component = createWithFormBuilder(() => new StynxPreferencesFormComponent());
    const seen: unknown[] = [];
    component.save.subscribe((value) => seen.push(value));
    component.value = null;
    expect(component.form.getRawValue()).toEqual({
      locale: 'en-US',
      notifications: false,
    });
    component.value = {
      locale: 'en-US',
      notifications: false,
    };

    expect(component.form.dirty).toBe(false);
    component.form.patchValue({
      notifications: true,
    });
    component.form.markAsDirty();
    expect(component.form.dirty).toBe(true);
    component.submit();
    expect(seen).toEqual([{ locale: 'en-US', notifications: true }]);
    expect(component.form.dirty).toBe(false);
  });
});
