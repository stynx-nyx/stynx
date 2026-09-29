import { vi } from 'vitest';

const mocks = { launch: vi.fn() };
let LocalPdfRenderBackend: typeof import('../../src').LocalPdfRenderBackend;
let PdfProfileUnsupportedError: typeof import('../../src').PdfProfileUnsupportedError;
let PdfValidationError: typeof import('../../src').PdfValidationError;
type RenderRequest = import('../../src').RenderRequest;

describe('LocalPdfRenderBackend branches', () => {
  beforeAll(async () => {
    vi.resetModules();
    vi.doMock('playwright', () => ({ chromium: { launch: mocks.launch } }));
    ({ LocalPdfRenderBackend, PdfProfileUnsupportedError, PdfValidationError } = await import('../../src'));
  });
  beforeEach(() => mocks.launch.mockReset());
  afterAll(() => { vi.doUnmock('playwright'); vi.resetModules(); });

  it('rejects fixture and unsupported template engines before launching Chromium', async () => {
    const backend = new LocalPdfRenderBackend();
    await expect(backend.render(request({ engine: 'fixture' }))).rejects.toBeInstanceOf(PdfValidationError);
    await expect(backend.render(request({ engine: 'bad' as never }))).rejects.toBeInstanceOf(PdfValidationError);
    expect(mocks.launch).not.toHaveBeenCalled();
  });

  it('reuses a connected browser and merges page, metadata, base URL, and version options', async () => {
    const { browser, page } = fakeBrowser();
    mocks.launch.mockResolvedValue(browser);
    const backend = new LocalPdfRenderBackend({
      timeoutMs: 321,
      baseUrl: 'https://example.test/a&b"c',
      defaultPdfOptions: { landscape: true, format: 'Letter' },
      defaultMetadata: { source: 'defaults', tenantId: 'overridden' },
    });
    const input = request({ engine: 'handlebars', source: '<html><head class="main"></head><body>{{name}}</body></html>', version: 'v2' }, {
      data: { name: 'Ada' }, metadata: { source: 'request' }, output: { pdf: { format: 'A4', scale: 0.8 } },
    });

    const first = await backend.render(input);
    const second = await backend.render(input);

    expect(mocks.launch).toHaveBeenCalledOnce();
    expect(page.setDefaultTimeout).toHaveBeenCalledWith(321);
    expect(page.setContent).toHaveBeenCalledWith(
      '<html><head class="main"><base href="https://example.test/a&amp;b&quot;c"></head><body>Ada</body></html>',
      { waitUntil: 'load' },
    );
    expect(page.pdf).toHaveBeenCalledWith(expect.objectContaining({ format: 'A4', landscape: true, scale: 0.8 }));
    expect(first).toMatchObject({ templateVersion: 'v2', pageCount: 2, metadata: {
      source: 'request', tenantId: 'tenant-1', engine: 'handlebars', profile: 'pdf',
    } });
    expect(second.bytes).toEqual(first.bytes);
    expect(page.close).toHaveBeenCalledTimes(2);
    await backend.dispose();
    expect(browser.close).toHaveBeenCalledOnce();
  });

  it('inserts a base URL when the HTML has no head element and handles unframed PDF bytes', async () => {
    const { browser, page } = fakeBrowser(Buffer.from('ordinary bytes'));
    mocks.launch.mockResolvedValue(browser);
    const backend = new LocalPdfRenderBackend({ baseUrl: 'https://assets.example/' });
    const result = await backend.render(request({ source: '<body>hello</body>' }));
    expect(page.setContent).toHaveBeenCalledWith('<base href="https://assets.example/"><body>hello</body>', { waitUntil: 'load' });
    expect(result.pageCount).toBe(1);
    await backend.dispose();
  });

  it('shares concurrent launches and launches again after a disconnect notification', async () => {
    const { browser } = fakeBrowser();
    mocks.launch.mockResolvedValue(browser);
    const backend = new LocalPdfRenderBackend();
    await Promise.all([backend.render(request()), backend.render(request())]);
    expect(mocks.launch).toHaveBeenCalledOnce();
    const disconnected = browser.on.mock.calls.find(([event]) => event === 'disconnected')?.[1] as (() => void) | undefined;
    expect(disconnected).toBeTypeOf('function');
    disconnected!();
    await backend.render(request());
    expect(mocks.launch).toHaveBeenCalledTimes(2);
    await backend.onModuleDestroy();
  });

  it('retries a failed Chromium launch and honors launch timeout options', async () => {
    const { browser } = fakeBrowser();
    mocks.launch.mockRejectedValueOnce('binary missing').mockResolvedValueOnce(browser);
    const backend = new LocalPdfRenderBackend({ launchOptions: { timeout: 42, args: ['--no-sandbox'] } });
    await expect(backend.render(request())).rejects.toMatchObject({
      name: 'PdfRenderError', message: 'Local PDF rendering failed: binary missing',
    });
    expect(mocks.launch).toHaveBeenLastCalledWith({ headless: true, args: ['--no-sandbox'], timeout: 42 });
    await expect(backend.render(request())).resolves.toMatchObject({ contentType: 'application/pdf' });
    expect(mocks.launch).toHaveBeenCalledTimes(2);
    await backend.dispose();
  });

  it('wraps render failures, preserves PDF validation errors, and always closes an opened page', async () => {
    const { browser, page } = fakeBrowser();
    mocks.launch.mockResolvedValue(browser);
    const backend = new LocalPdfRenderBackend();
    page.pdf.mockRejectedValueOnce({ message: 'printer failed' });
    await expect(backend.render(request())).rejects.toMatchObject({
      name: 'PdfRenderError', message: 'Local PDF rendering failed: [object Object]',
    });
    expect(page.close).toHaveBeenCalledOnce();

    page.pdf.mockRejectedValueOnce(new Error('browser crash'));
    await expect(backend.render(request())).rejects.toMatchObject({
      name: 'PdfRenderError', message: 'Local PDF rendering failed: browser crash',
    });

    page.pdf.mockRejectedValueOnce(new PdfValidationError('bad document'));
    await expect(backend.render(request())).rejects.toBeInstanceOf(PdfValidationError);
    page.pdf.mockRejectedValueOnce(new PdfProfileUnsupportedError());
    await expect(backend.render(request())).rejects.toBeInstanceOf(PdfProfileUnsupportedError);
    expect(page.close).toHaveBeenCalledTimes(4);
    await backend.dispose();
  });

  it('applies PDF/A conversion after Chromium renders when an adapter is configured', async () => {
    const { browser } = fakeBrowser();
    mocks.launch.mockResolvedValue(browser);
    const convert = vi.fn(async (result) => ({ ...result, metadata: { ...result.metadata, converted: 'yes' } }));
    const backend = new LocalPdfRenderBackend({ pdfAAdapter: { convert } });
    const result = await backend.render(request({}, { output: { profile: 'pdf-a' } }));
    expect(convert).toHaveBeenCalledOnce();
    expect(result.metadata.converted).toBe('yes');
    await backend.dispose();
  });
});

function request(template: Partial<RenderRequest['template']> = {}, options: Partial<RenderRequest> = {}): RenderRequest {
  return {
    tenantId: 'tenant-1', template: { id: 'document', engine: 'html', source: '<html></html>', ...template },
    data: {}, ...options,
  };
}

function fakeBrowser(bytes: Uint8Array = Buffer.from('/Type /Page /Type /Page')) {
  const page = {
    setDefaultTimeout: vi.fn(), setContent: vi.fn(async () => undefined),
    pdf: vi.fn(async () => bytes), close: vi.fn(async () => undefined),
  };
  const browser = {
    isConnected: vi.fn(() => true), newPage: vi.fn(async () => page), close: vi.fn(async () => undefined),
    on: vi.fn(),
  };
  return { browser, page };
}
