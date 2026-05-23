import { type DynamicModule, Module } from '@nestjs/common';
import { LocalPdfRenderBackend } from './local-backend';
import { PdfRenderer } from './pdf-renderer';
import { STYNX_PDF_BACKEND, STYNX_PDF_OPTIONS } from './tokens';
import type { PdfRenderBackend, StynxPdfModuleOptions } from './types';

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
