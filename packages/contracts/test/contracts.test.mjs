import test from 'node:test';
import assert from 'node:assert/strict';

test('@stynx/contracts barrel is importable after build', async () => {
  const contracts = await import('../dist/contracts/src/index.js');
  assert.equal(typeof contracts.StynxError, 'function');
  assert.equal(typeof contracts.IdentityAdminError, 'function');
});
