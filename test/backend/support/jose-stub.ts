export type JWTPayload = Record<string, unknown>;

export function createRemoteJWKSet(): () => never {
  return () => {
    throw new Error('createRemoteJWKSet is not exercised by backend unit tests');
  };
}

export async function jwtVerify(): Promise<never> {
  throw new Error('jwtVerify is not exercised by backend unit tests');
}
