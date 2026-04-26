import { AsyncPipe, JsonPipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { hasAnyRole } from '@stech/stynx-frontend-client';
import { ReferenceApiService } from '../core/reference-api.service';
import { ReferenceAuthFacade } from '../core/reference-auth.facade';

@Component({
  selector: 'stc-reference-dashboard-page',
  standalone: true,
  imports: [AsyncPipe, JsonPipe],
  template: `
    <section style="border:1px solid #ddd; border-radius:8px; padding:1rem;">
      <h2>Dashboard</h2>
      <p>Token-aware requests and tenant header wiring are active in this module.</p>
      <div style="display:flex; gap:0.5rem; margin-bottom:1rem;">
        <button type="button" (click)="refreshHealth()">Call /health</button>
      </div>
      <p><strong>API status:</strong> {{ apiStatus }}</p>
      <p><strong>Admin role:</strong> {{ isPlatformAdmin ? 'yes' : 'no' }}</p>
      <pre style="background:#f6f6f6; padding:0.75rem; border-radius:6px;">{{ auth.principal$ | async | json }}</pre>
    </section>
  `,
})
export class DashboardPageComponent {
  readonly auth = inject(ReferenceAuthFacade);
  private readonly api = inject(ReferenceApiService);
  apiStatus = 'idle';
  isPlatformAdmin = false;

  constructor() {
    this.auth.principal$.subscribe((principal) => {
      this.isPlatformAdmin = hasAnyRole(principal, ['platform:admin', 'platform:superadmin']);
    });
  }

  async refreshHealth(): Promise<void> {
    this.apiStatus = 'loading';
    try {
      const result = await this.api.getHealth();
      this.apiStatus = `${result.status}${result.timestamp ? ` @ ${result.timestamp}` : ''}`;
    } catch (err) {
      this.apiStatus = `error: ${err instanceof Error ? err.message : String(err)}`;
    }
  }
}
