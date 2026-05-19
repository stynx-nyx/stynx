import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { StynxGroupRolesEditorComponent } from '../../src/group-roles-editor.component';
import { IamApiService } from '../../src/iam-api.service';
import { FakeIamApi } from '../support/fixtures';
import { renderComponent } from '../support/test-bed';

describe('StynxGroupRolesEditorComponent', () => {
  it('loads group roles, toggles assignment, and emits saved role ids', async () => {
    const fixture = await renderComponent(StynxGroupRolesEditorComponent, { inputs: { groupId: 'group-1' } });
    const component = fixture.componentInstance;
    const access = component as unknown as { hasRole(id: string): boolean; toggleRole(id: string): void; save(): void };
    const api = TestBed.inject(IamApiService) as unknown as FakeIamApi;
    const changed: string[][] = [];
    component.rolesChanged.subscribe((ids) => changed.push(ids));

    expect(access.hasRole('role-1')).toBe(true);
    access.toggleRole('role-2');
    access.save();

    expect(fixture.nativeElement.textContent).toContain('Admin');
    expect(api.setGroupRoles).toHaveBeenCalledWith('group-1', ['role-1', 'role-2']);
    expect(changed).toEqual([['role-1', 'role-2']]);
  });
});
