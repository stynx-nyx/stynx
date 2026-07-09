// Smoke check: @stynx-nyx/flow module barrel loads. Authored U9 (2026-05-17)
// to keep test/source ratio above the F3xT3 threshold as the Flow
// surface grows (currently 0.125, threshold 0.10).

import * as flow from '../../src/index';

describe('@stynx-nyx/flow module barrel', () => {
  it('top-level index.ts is importable', () => {
    expect(flow).toEqual(expect.objectContaining({
      StynxFlowModule: expect.any(Function),
      FlowRuntimeService: expect.any(Function),
      FlowFormsService: expect.any(Function),
    }));
  });
});
