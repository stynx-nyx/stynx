/** Preserve the installed ASN.1 parser's backing-buffer boundary after slicing. */
export function nativeAsn1Buffer(value: ArrayBufferLike): ArrayBuffer {
  if (value instanceof ArrayBuffer) return value;
  // The installed parser handles empty buffers before its BufferSource conversion.
  if (value.byteLength === 0) return new ArrayBuffer(0);
  // Cross-realm ArrayBuffer instances are accepted by the installed converter.
  // Copy bytes only in this branch; never claim a SharedArrayBuffer is ArrayBuffer.
  if (Object.prototype.toString.call(value) === '[object ArrayBuffer]') {
    return new Uint8Array(new Uint8Array(value)).buffer;
  }
  throw new TypeError("The provided value is not of type '(ArrayBuffer or ArrayBufferView)'");
}
