import { Component, Renderer2, inject } from '@angular/core';
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
  private readonly renderer = inject(Renderer2);
  isDark = false;

  toggle(): void {
    this.isDark = !this.isDark;
    if (this.isDark) {
      this.renderer.addClass(document.body, 'dark-theme');
    } else {
      this.renderer.removeClass(document.body, 'dark-theme');
    }
  }
}
