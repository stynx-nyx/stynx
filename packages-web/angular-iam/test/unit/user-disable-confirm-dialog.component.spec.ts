import { describe, expect, it } from 'vitest';
import { StynxUserDisableConfirmDialogComponent } from '../../src/user-disable-confirm-dialog.component';
import { USERS } from '../support/fixtures';
import { renderComponent } from '../support/test-bed';

describe('StynxUserDisableConfirmDialogComponent', () => {
  it('renders the target user and emits confirm or dismiss actions', async () => {
    const fixture = await renderComponent(StynxUserDisableConfirmDialogComponent, {
      inputs: { open: true, user: USERS[0]! },
    });
    const component = fixture.componentInstance;
    const events: string[] = [];
    component.confirm.subscribe(() => events.push('confirm'));
    component.dismissed.subscribe(() => events.push('dismiss'));

    component.confirm.emit();
    component.dismissed.emit();

    expect(fixture.nativeElement.textContent).toContain('ada@example.test');
    expect(events).toEqual(['confirm', 'dismiss']);
  });
});
