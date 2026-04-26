import { Component, inject } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { AsyncPipe, JsonPipe } from '@angular/common';
import { ReferenceAuthFacade } from './core/reference-auth.facade';

@Component({
  selector: 'stc-root',
  standalone: true,
  imports: [RouterOutlet, AsyncPipe, JsonPipe],
  template: `
    <main style="max-width: 960px; margin: 0 auto; padding: 2rem;">
      <header style="display:flex; align-items:center; justify-content:space-between; margin-bottom: 1rem;">
        <h1 style="margin:0;">stynx Reference Frontend</h1>
        <div style="display:flex; gap:0.5rem;">
          <button type="button" (click)="goHome()">Home</button>
          <button type="button" (click)="goLogin()">Login</button>
          <button type="button" (click)="logout()">Logout</button>
        </div>
      </header>
      <section style="margin-bottom: 1rem;">
        <strong>Principal Snapshot:</strong>
        <pre style="background:#f6f6f6; padding:0.75rem; border-radius:6px;">{{ auth.principal$ | async | json }}</pre>
      </section>
      <router-outlet />
    </main>
  `,
})
export class AppComponent {
  readonly auth = inject(ReferenceAuthFacade);
  private readonly router = inject(Router);

  goHome(): void {
    void this.router.navigate(['/']);
  }

  goLogin(): void {
    void this.router.navigate(['/login']);
  }

  logout(): void {
    this.auth.logout();
    void this.router.navigate(['/login']);
  }
}
