import { describe, expect, it } from 'vitest';
import { StynxGroupCreateDialogComponent } from '../../src/group-create-dialog.component';
import type { StynxCreateGroupRequest } from '../../src/types';
import { renderComponent } from '../support/test-bed';

describe('StynxGroupCreateDialogComponent', () => {
  it('validates required fields and emits trimmed optional description', async () => {
    const fixture = await renderComponent(StynxGroupCreateDialogComponent, { inputs: { open: true } });
    const component = fixture.componentInstance;
    const access = component as unknown as { submit(): void };
    const created: StynxCreateGroupRequest[] = [];
    component.create.subscribe((body) => created.push(body));

    access.submit();
    component.form.setValue({ key: ' ops ', name: ' Operations ', description: ' Team ' });
    access.submit();

    expect(fixture.nativeElement.textContent).toContain('iam.groups.create.title');
    expect(created).toEqual([{ key: 'ops', name: 'Operations', description: 'Team' }]);
  });
});
