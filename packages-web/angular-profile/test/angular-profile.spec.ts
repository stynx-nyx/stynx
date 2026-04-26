import '@angular/compiler';
import { FormBuilder } from '@angular/forms';
import { StynxPreferencesFormComponent } from '../src/preferences-form.component';
import { StynxProfileFormComponent } from '../src/profile-form.component';

describe('@stynx-web/angular-profile', () => {
  it('validates the profile form and emits only when dirty and valid', () => {
    const component = new StynxProfileFormComponent(new FormBuilder());
    const seen: unknown[] = [];
    component.save.subscribe((value) => seen.push(value));

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
    const component = new StynxPreferencesFormComponent(new FormBuilder());
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
  });
});
