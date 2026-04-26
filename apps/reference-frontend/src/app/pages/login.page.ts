import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { ReferenceAuthFacade } from '../core/reference-auth.facade';

@Component({
  selector: 'stc-reference-login-page',
  standalone: true,
  template: `
    <section style="border:1px solid #ddd; border-radius:8px; padding:1rem;">
      <h2>Login</h2>
      <p>This page demonstrates provider-generic login handoff using stynx frontend libraries.</p>
      <div style="display:flex; gap:0.5rem;">
        <button type="button" (click)="simulateCallback()">Simulate Callback Token</button>
        <button type="button" (click)="startHostedUiLogin()">Start Cognito Hosted UI Login</button>
      </div>
    </section>
  `,
})
export class LoginPageComponent {
  private readonly auth = inject(ReferenceAuthFacade);
  private readonly router = inject(Router);

  startHostedUiLogin(): void {
    this.auth.beginLogin();
  }

  simulateCallback(): void {
    // Non-signed demo payload for local wiring validation only.
    const demoPayload = btoa(
      JSON.stringify({
        sub: 'demo-user',
        email: 'demo@example.local',
        roles: ['platform:admin'],
        permissions: ['storage:read'],
        tenant_id: 'tenant-demo',
        exp: Math.floor(Date.now() / 1000) + 3600,
      }),
    )
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '');

    const fakeJwt = `header.${demoPayload}.signature`;
    this.auth.hydrateFromCallbackHash(`#access_token=${fakeJwt}&token_type=Bearer&expires_in=3600`);
    void this.router.navigate(['/']);
  }
}
