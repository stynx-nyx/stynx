import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { StynxGroupDetailComponent } from '../../src/group-detail.component';
import { IamApiService } from '../../src/iam-api.service';
import { FakeIamApi } from '../support/fixtures';
import { renderComponent } from '../support/test-bed';

describe('StynxGroupDetailComponent', () => {
  it('loads a group and saves overview changes without blank descriptions', async () => {
    const fixture = await renderComponent(StynxGroupDetailComponent, { inputs: { groupId: 'group-1' } });
    const component = fixture.componentInstance;
    const access = component as unknown as { saveOverview(): void };
    const api = TestBed.inject(IamApiService) as unknown as FakeIamApi;

    component.overviewForm.setValue({ key: ' ops ', name: ' Ops updated ', description: ' ' });
    access.saveOverview();

    expect(fixture.nativeElement.textContent).toContain('Operations');
    expect(api.patchGroup).toHaveBeenCalledWith('group-1', { key: 'ops', name: 'Ops updated' });
  });
});
