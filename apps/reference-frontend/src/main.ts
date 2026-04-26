import 'zone.js';
import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';
import { ReferenceFrontendModule } from './app/reference-frontend.module';

void platformBrowserDynamic()
  .bootstrapModule(ReferenceFrontendModule)
  .catch((err: unknown) => {
    console.error('Failed to bootstrap reference frontend', err);
  });
