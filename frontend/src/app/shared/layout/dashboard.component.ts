import { AsyncPipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { RouterLink, RouterOutlet } from '@angular/router';
import { Observable } from 'rxjs';
import { AuthFacade, AuthUser } from '@core/auth/auth.facade';
import { DebugUserBannerComponent } from '@shared/components/debug-user-banner/debug-user-banner.component';
import { LanguageSwitcherComponent } from '@shared/components/language-switcher/language-switcher.component';
import { ThemeSwitcherComponent } from '@shared/components/theme-switcher/theme-switcher.component';
import { LoggingSwitcherComponent } from '@shared/components/logging-switcher/logging-switcher.component';

@Component({
  standalone: true,
  selector: 'stc-dashboard',
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss'],
  imports: [
    MatSidenavModule,
    MatToolbarModule,
    MatButtonModule,
    MatIconModule,
    MatListModule,
    RouterOutlet,
    RouterLink,
    AsyncPipe,
    DebugUserBannerComponent,
    LanguageSwitcherComponent,
    ThemeSwitcherComponent,
    LoggingSwitcherComponent,
  ],
})
export class DashboardComponent {
  private readonly auth = inject(AuthFacade);
  readonly user$: Observable<AuthUser | null> = this.auth.user$;

  logout(): void {
    this.auth.logout();
  }
}
