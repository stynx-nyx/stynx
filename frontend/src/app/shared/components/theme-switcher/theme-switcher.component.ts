import { Component, Renderer2 } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';

@Component({
  selector: 'stc-theme-switcher',
  standalone: true,
  imports: [MatIconModule, MatButtonModule],
  templateUrl: './theme-switcher.component.html',
  styleUrls: ['./theme-switcher.component.scss'],
})
export class ThemeSwitcherComponent {
  private isDark = false;

  constructor(private readonly renderer: Renderer2) {}

  toggle(): void {
    this.isDark = !this.isDark;
    if (this.isDark) {
      this.renderer.addClass(document.body, 'dark-theme');
    } else {
      this.renderer.removeClass(document.body, 'dark-theme');
    }
  }
}
