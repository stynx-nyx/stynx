const VERIFIED_PRINCIPAL = Symbol('stynx.verified-principal');

export function markVerifiedPrincipal(request: object): void {
  Object.defineProperty(request, VERIFIED_PRINCIPAL, { value: true, configurable: true });
}

export function clearVerifiedPrincipal(request: object): void {
  Reflect.deleteProperty(request, VERIFIED_PRINCIPAL);
}

export function hasVerifiedPrincipal(request: object): boolean {
  return Reflect.get(request, VERIFIED_PRINCIPAL) === true;
}
