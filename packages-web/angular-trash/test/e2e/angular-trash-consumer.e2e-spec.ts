import '@angular/compiler';
import { describe, expect, it } from 'vitest';
import { StynxTrashListComponent } from '../../src';

describe('@stynx-web/angular-trash consumer E2E', () => {
  it('exposes the reusable trash list component', () => {
    expect(StynxTrashListComponent).toBeDefined();
  });
});
