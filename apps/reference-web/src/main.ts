import 'zone.js';
import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';
import { ReferenceWebModule } from './app/reference-web.module';

void platformBrowserDynamic()
  .bootstrapModule(ReferenceWebModule)
  .catch((error: unknown) => {
    console.error('Failed to bootstrap reference web', error);
  });
