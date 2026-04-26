import type { Routes } from '@angular/router';
import { referenceAuthGuard } from './core/auth.guard';
import { DashboardPageComponent } from './pages/dashboard.page';
import { LoginPageComponent } from './pages/login.page';

export const APP_ROUTES: Routes = [
  {
    path: 'login',
    component: LoginPageComponent,
    title: 'Login',
  },
  {
    path: '',
    component: DashboardPageComponent,
    canActivate: [referenceAuthGuard],
    title: 'Dashboard',
  },
  {
    path: '**',
    redirectTo: '',
  },
];
