import { STYNX_HEALTH_INDICATORS, STYNX_HEALTH_OPTIONS } from '../../src/tokens';
import { StynxHealthModule } from '../../src/health.module';

describe('StynxHealthModule.forRoot', () => {
  it('wires default module options and indicators', () => {
    const module = StynxHealthModule.forRoot();

    expect(module.providers).toEqual(expect.arrayContaining([
      expect.objectContaining({ provide: STYNX_HEALTH_OPTIONS, useValue: {} }),
      expect.objectContaining({ provide: STYNX_HEALTH_INDICATORS, useValue: [] }),
    ]));
  });
});
