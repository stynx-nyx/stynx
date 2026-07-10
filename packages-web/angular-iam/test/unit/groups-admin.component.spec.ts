import { ActivatedRoute, Router } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import { StynxToastService } from '@stynx-nyx/angular-ui';
import { describe, expect, it, vi } from 'vitest';
import { IamApiService } from '../../src/iam-api.service';
import { StynxGroupsAdminComponent } from '../../src/groups-admin.component';
import { FakeIamApi, GROUPS } from '../support/fixtures';
import { renderComponent } from '../support/test-bed';

describe('StynxGroupsAdminComponent', () => {
  it('filters groups, creates, deletes, and navigates to group detail', async () => {
    const router = { navigate: vi.fn() };
    const route = {};
    const fixture = await renderComponent(StynxGroupsAdminComponent, {
      providers: [
        { provide: Router, useValue: router },
        { provide: ActivatedRoute, useValue: route },
      ],
    });
    const component = fixture.componentInstance;
    const access = component as unknown as {
      search(): void;
      openCreateDialog(): void;
      createGroup(body: { key: string; name: string }): void;
      deleteGroup(group: typeof GROUPS[number]): void;
      openDetail(group: typeof GROUPS[number]): void;
    };
    const api = TestBed.inject(IamApiService) as unknown as FakeIamApi;
    const toast = TestBed.inject(StynxToastService) as unknown as { push: ReturnType<typeof vi.fn> };

    component.searchForm.controls.q.setValue('fin');
    access.search();
    access.openCreateDialog();
    access.createGroup({ key: 'support', name: 'Support' });
    access.deleteGroup(GROUPS[0]!);
    access.openDetail(GROUPS[0]!);

    expect(component.filteredGroups().map((group) => group.key)).toEqual(['finance']);
    expect(api.createGroup).toHaveBeenCalledWith({ key: 'support', name: 'Support' });
    expect(api.deleteGroup).toHaveBeenCalledWith('group-1');
    expect(router.navigate).toHaveBeenCalledWith(['group-1'], { relativeTo: route });
    expect(toast.push).toHaveBeenCalledWith('iam.groups.delete.deleted', 'success');
  });
});
