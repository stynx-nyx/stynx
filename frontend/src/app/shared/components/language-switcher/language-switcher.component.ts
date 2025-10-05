import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
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
  readonly languages = ['en', 'pt'];

  constructor(private readonly translate: TranslateService) {}

  switch(language: string): void {
    this.translate.use(language);
  }
}
