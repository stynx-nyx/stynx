import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { StynxGroupMembersEditorComponent } from '../../src/group-members-editor.component';
import { IamApiService } from '../../src/iam-api.service';
import { FakeIamApi, USERS } from '../support/fixtures';
import { renderComponent } from '../support/test-bed';

describe('StynxGroupMembersEditorComponent', () => {
  it('filters available users, toggles membership, and emits saved user ids', async () => {
    const fixture = await renderComponent(StynxGroupMembersEditorComponent, { inputs: { groupId: 'group-1' } });
    const component = fixture.componentInstance;
    const access = component as unknown as {
      search(): void;
      toggleMember(id: string): void;
      save(): void;
      displayName(user: typeof USERS[number]): string;
    };
    const api = TestBed.inject(IamApiService) as unknown as FakeIamApi;
    const changed: string[][] = [];
    component.membersChanged.subscribe((ids) => changed.push(ids));

    component.searchForm.controls.q.setValue('Grace');
    access.search();
    access.toggleMember('user-2');
    access.save();

    expect(component.filteredUsers().map((user) => user.id)).toEqual(['user-2']);
    expect(access.displayName(USERS[0]!)).toBe('Ada Lovelace');
    expect(api.setGroupMembers).toHaveBeenCalledWith('group-1', ['user-1', 'user-2']);
    expect(changed).toEqual([['user-1', 'user-2']]);
  });
});
