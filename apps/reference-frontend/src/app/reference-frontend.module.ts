import { APP_INITIALIZER, NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { RouterModule } from '@angular/router';
import { AppComponent } from './app.component';
import { APP_ROUTES } from './app.routes';
import { ReferenceAuthFacade } from './core/reference-auth.facade';
import { DashboardPageComponent } from './pages/dashboard.page';
import { LoginPageComponent } from './pages/login.page';

const initAuth = (auth: ReferenceAuthFacade) => () => {
  auth.initFromWindowLocation();
};

@NgModule({
  imports: [BrowserModule, RouterModule.forRoot(APP_ROUTES), AppComponent, LoginPageComponent, DashboardPageComponent],
  providers: [{ provide: APP_INITIALIZER, useFactory: initAuth, deps: [ReferenceAuthFacade], multi: true }],
  bootstrap: [AppComponent],
})
export class ReferenceFrontendModule {}
