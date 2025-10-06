import { AsyncPipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { BehaviorSubject, switchMap } from 'rxjs';
import { ApiService } from '@core/api/api.service';

interface TenancyVm {
  tenancyId: string;
  code: string;
  name: string;
  isActive: boolean;
}

@Component({
  standalone: true,
  selector: 'stc-admin-tenancies',
  imports: [
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    ReactiveFormsModule,
    AsyncPipe,
  ],
  templateUrl: './admin-tenancies.component.html',
  styleUrls: ['./admin-tenancies.component.scss'],
})
export class AdminTenanciesComponent {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(ApiService);
  private readonly refresh$ = new BehaviorSubject<void>(undefined);
  readonly form = this.fb.group({
    code: ['', [Validators.required, Validators.pattern(/^[a-z0-9-]+$/)]],
    name: ['', Validators.required],
  });
  readonly tenancies$ = this.refresh$.pipe(switchMap(() => this.api.get<TenancyVm[]>('/tenancies')));

  create(): void {
    if (this.form.invalid) {
      return;
    }
    const payload = this.form.value;
    this.api.post<TenancyVm>('/tenancies', payload).subscribe(() => {
      this.form.reset();
      this.refresh$.next();
    });
  }
}
