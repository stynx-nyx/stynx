import { Component } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';

@Component({
  selector: 'stc-logging-switcher',
  standalone: true,
  imports: [MatButtonModule],
  templateUrl: './logging-switcher.component.html',
  styleUrls: ['./logging-switcher.component.scss'],
})
export class LoggingSwitcherComponent {
  enabled = localStorage.getItem('stc-debug-logging') === '1';

  toggle(): void {
    this.enabled = !this.enabled;
    if (this.enabled) {
      localStorage.setItem('stc-debug-logging', '1');
    } else {
      localStorage.removeItem('stc-debug-logging');
    }
  }
}
