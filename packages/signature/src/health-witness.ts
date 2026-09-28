import type { StynxHealthIndicator } from '@stynx-nyx/health';

const witnesses = new WeakMap<object, {
  indicator: StynxHealthIndicator;
  registered: StynxHealthIndicator[];
}>();

export function registerSignatureHealthWitness(
  value: object,
  indicator: StynxHealthIndicator,
  registered: StynxHealthIndicator[],
): void {
  witnesses.set(value, { indicator, registered });
}

export function isSignatureHealthWitness(value: object): boolean {
  const witness = witnesses.get(value);
  return !!witness && witness.registered.includes(witness.indicator) &&
    witness.registered.filter((item) => item.name === 'signature').length === 1;
}
