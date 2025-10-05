import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { TranslateService } from '@ngx-translate/core';

@Component({
  selector: 'stc-language-switcher',
  standalone: true,
  imports: [CommonModule, MatButtonModule],
  templateUrl: './language-switcher.component.html',
  styleUrls: ['./language-switcher.component.scss'],
})
export class LanguageSwitcherComponent {
  private readonly translate = inject(TranslateService);
  readonly languages = ['en', 'pt'];

  switch(language: string): void {
    this.translate.use(language);
  }
}
