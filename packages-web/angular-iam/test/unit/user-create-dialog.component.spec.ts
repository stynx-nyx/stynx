import { describe, expect, it } from 'vitest';
import { StynxUserCreateDialogComponent } from '../../src/user-create-dialog.component';
import type { StynxCreateUserRequest } from '../../src/types';
import { renderComponent } from '../support/test-bed';

describe('StynxUserCreateDialogComponent', () => {
  it('validates form input and emits a trimmed create payload', async () => {
    const fixture = await renderComponent(StynxUserCreateDialogComponent, { inputs: { open: true } });
    const component = fixture.componentInstance;
    const access = component as unknown as { submit(): void };
    const created: StynxCreateUserRequest[] = [];
    component.create.subscribe((body) => created.push(body));

    access.submit();
    expect(component.form.invalid).toBe(true);

    component.form.setValue({
      email: 'ada@example.test',
      firstName: ' Ada ',
      lastName: ' ',
      locale: ' pt-BR ',
      sendInvite: false,
    });
    access.submit();

    expect(fixture.nativeElement.textContent).toContain('iam.users.create.title');
    expect(created).toEqual([{ email: 'ada@example.test', firstName: 'Ada', locale: 'pt-BR', sendInvite: false }]);
  });
});
