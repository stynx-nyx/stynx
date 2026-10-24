import {
  validateMultipartInitiateResponse,
  validateMultipartStatusResponse,
} from '../src/multipart-response-validation';

const initiation = () => ({
  uploadId: 'upload-1',
  completeUrl: 'https://example.test/complete',
  chunks: [{ partNumber: 1, url: 'https://example.test/part', headers: { 'x-upload': 'one' } }],
});
const status = () => ({ uploadId: 'upload-1', completedParts: [1, { partNumber: 2, etag: 'etag-2' }] });

it('retains complete initiation envelopes and opaque extension identities', () => {
  const extension = { nested: [null, { opaque: true }] };
  const value = { ...initiation(), extension };
  const checked = validateMultipartInitiateResponse(value);
  expect(checked).toBe(value);
  expect(checked.chunks).toBe(value.chunks);
  expect(checked.chunks[0]).toBe(value.chunks[0]);
  expect(value.extension).toBe(extension);
  const minimal = { uploadId: '', chunks: [{ partNumber: -0.5, url: '' }] };
  expect(validateMultipartInitiateResponse(minimal)).toBe(minimal);
});

it('retains mixed completed-part envelopes and the existing number contract', () => {
  const value = { ...status(), extension: { opaque: ['preserved', null] } };
  expect(validateMultipartStatusResponse(value)).toBe(value);
  expect(validateMultipartStatusResponse(value).completedParts).toBe(value.completedParts);
  const numerical = { uploadId: '', completedParts: [-0.5, { partNumber: Infinity }] };
  expect(validateMultipartStatusResponse(numerical)).toBe(numerical);
  expect(validateMultipartStatusResponse({ uploadId: 'empty', completedParts: [] })).toEqual({ uploadId: 'empty', completedParts: [] });
});

it.each([
  null, [], 'private-initiation-payload', {},
  { chunks: [] }, { uploadId: 42, chunks: [] }, { uploadId: 'id', chunks: null },
  { uploadId: 'id', chunks: [null] }, { uploadId: 'id', chunks: [[]] },
  { uploadId: 'id', chunks: [{ partNumber: '1', url: 'url' }] },
  { uploadId: 'id', chunks: [{ partNumber: 1, url: 42 }] },
  { uploadId: 'id', chunks: [{ partNumber: 1, url: 'url', headers: null }] },
  { uploadId: 'id', chunks: [{ partNumber: 1, url: 'url', headers: [] }] },
  { uploadId: 'id', chunks: [{ partNumber: 1, url: 'url', headers: { secret: 42 } }] },
  { ...initiation(), completeUrl: null }, { ...initiation(), completeUrl: 42 },
].map((value) => [value]))('rejects malformed initiation fields without retaining payload: %j', (value) => {
  let error: unknown;
  try { validateMultipartInitiateResponse(value); } catch (caught) { error = caught; }
  expect(error).toBeInstanceOf(Error);
  expect(String(error)).toBe('Error: Invalid multipart initiation response');
  expect(error).not.toHaveProperty('cause');
});

it.each([
  null, [], 'private-status-payload', {}, { uploadId: 42, completedParts: [] },
  { uploadId: 'id', completedParts: null }, { uploadId: 'id', completedParts: ['1'] },
  { uploadId: 'id', completedParts: [null] }, { uploadId: 'id', completedParts: [[]] },
  { uploadId: 'id', completedParts: [{}] }, { uploadId: 'id', completedParts: [{ partNumber: '2' }] },
  { uploadId: 'id', completedParts: [{ partNumber: 2, etag: 42 }] },
  { uploadId: 'id', completedParts: [{ partNumber: 2, etag: null }] },
].map((value) => [value]))('rejects malformed status fields without retaining payload: %j', (value) => {
  let error: unknown;
  try { validateMultipartStatusResponse(value); } catch (caught) { error = caught; }
  expect(error).toBeInstanceOf(Error);
  expect(String(error)).toBe('Error: Invalid multipart status response');
  expect(error).not.toHaveProperty('cause');
});
