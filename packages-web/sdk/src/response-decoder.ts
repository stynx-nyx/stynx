/** Validates an unknown response and returns its proven application value. */
export type ResponseDecoder<T> = (value: unknown) => T;
