import { describe, expect, it } from 'vitest';
import { StynxRoleCreateDialogComponent } from '../../src/role-create-dialog.component';
import type { StynxCreateRoleRequest } from '../../src/types';
import { ROLES } from '../support/fixtures';
import { renderComponent } from '../support/test-bed';

describe('StynxRoleCreateDialogComponent', () => {
  it('emits create and clone payloads with optional description trimming', async () => {
    const fixture = await renderComponent(StynxRoleCreateDialogComponent, { inputs: { open: true } });
    const component = fixture.componentInstance;
    const access = component as unknown as { submit(): void };
    const created: StynxCreateRoleRequest[] = [];
    const cloned: StynxCreateRoleRequest[] = [];
    component.create.subscribe((body) => created.push(body));
    component.clone.subscribe((body) => cloned.push(body));

    component.form.setValue({ key: ' admin ', name: ' Admin ', description: ' ' });
    access.submit();
    component.sourceRole = ROLES[0]!;
    component.form.setValue({ key: ' clone ', name: ' Clone ', description: ' Copied ' });
    access.submit();

    expect(fixture.nativeElement.textContent).toContain('iam.roles.create.title');
    expect(created).toEqual([{ key: 'admin', name: 'Admin' }]);
    expect(cloned).toEqual([{ key: 'clone', name: 'Clone', description: 'Copied' }]);
  });
});
