import { type DynamicModule, Module } from '@nestjs/common';
import { LocalPdfRenderBackend } from './local-backend.js';
import { PdfRenderer } from './pdf-renderer.js';
import { STYNX_PDF_BACKEND, STYNX_PDF_OPTIONS } from './tokens.js';
import type { PdfRenderBackend, StynxPdfModuleOptions } from './types.js';

@Module({})
export class StynxPdfModule {
  static forRoot(options: StynxPdfModuleOptions = {}): DynamicModule {
    return {
      module: StynxPdfModule,
      global: true,
      providers: [
        {
          provide: STYNX_PDF_OPTIONS,
          useValue: options,
        },
        {
          provide: STYNX_PDF_BACKEND,
          useFactory: (): PdfRenderBackend => options.backend ?? new LocalPdfRenderBackend(options),
        },
        {
          provide: PdfRenderer,
          useFactory: (backend: PdfRenderBackend): PdfRenderer => new PdfRenderer(backend),
          inject: [STYNX_PDF_BACKEND],
        },
      ],
      exports: [STYNX_PDF_OPTIONS, STYNX_PDF_BACKEND, PdfRenderer],
    };
  }
}
