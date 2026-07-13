/* Generated for __NAMESPACE__/__MODULE__ — spec: __SPEC_VERSION__ sha: __SPEC_SHA__ */
import { Injectable } from '@angular/core';
import { CanActivate, Router } from '@angular/router';

@Injectable()
export class CognitoGuard implements CanActivate {
  constructor(private readonly router: Router) {}
  canActivate(): boolean {
    // Placeholder: the host app should inject a real auth service.
    const isAuthenticated = true; // scaffolder wires to Cognito SDK/Hosted UI
    if (!isAuthenticated) this.router.navigate(['/login']);
    return isAuthenticated;
  }
}
