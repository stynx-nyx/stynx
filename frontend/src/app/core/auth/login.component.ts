import { CommonModule } from '@angular/common';
import type { OnInit } from '@angular/core';
import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { Router } from '@angular/router';
import { AuthFacade } from './auth.facade';

@Component({
  standalone: true,
  selector: 'stc-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss'],
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
  ],
})
export class LoginComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthFacade);
  readonly form = this.fb.group({
    username: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
  });

  ngOnInit(): void {
    const hash = window.location.hash;
    if (hash.includes('access_token')) {
      const params = new URLSearchParams(hash.replace('#', ''));
      const accessToken = params.get('access_token');
      const idToken = params.get('id_token') ?? undefined;
      const expiresIn = Number(params.get('expires_in') ?? '3600');
      if (accessToken) {
        this.auth.setTokens({ accessToken, idToken, expiresAt: Date.now() + expiresIn * 1000 });
        this.auth.fetchProfile().subscribe({
          next: () => {
            void this.router.navigate(['/']);
          },
        });
      }
    }
  }

  submit(): void {
    if (this.form.invalid) {
      return;
    }
    this.auth.fetchProfile().subscribe({
      next: () => {
        void this.router.navigate(['/']);
      },
    });
  }

  loginWithCognito(): void {
    this.auth.login();
  }
}
