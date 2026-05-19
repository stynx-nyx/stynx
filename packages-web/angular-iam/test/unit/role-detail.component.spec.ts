import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { IamApiService } from '../../src/iam-api.service';
import { StynxRoleDetailComponent } from '../../src/role-detail.component';
import { FakeIamApi, ROLES } from '../support/fixtures';
import { renderComponent } from '../support/test-bed';

describe('StynxRoleDetailComponent', () => {
  it('loads a role, saves overview changes, and identifies system roles', async () => {
    const fixture = await renderComponent(StynxRoleDetailComponent, { inputs: { roleId: 'role-1' } });
    const component = fixture.componentInstance;
    const access = component as unknown as { saveOverview(): void; systemKey(role: typeof ROLES[number]): string };
    const api = TestBed.inject(IamApiService) as unknown as FakeIamApi;

    component.overviewForm.setValue({ key: ' admin ', name: ' Admin updated ', description: '' });
    access.saveOverview();

    expect(fixture.nativeElement.textContent).toContain('Admin');
    expect(api.patchRole).toHaveBeenCalledWith('role-1', { key: 'admin', name: 'Admin updated' });
    expect(access.systemKey(ROLES[1]!)).toBe('iam.common.yes');
  });
});
