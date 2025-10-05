import { AsyncPipe, JsonPipe, NgIf } from '@angular/common';
import { Component, Input } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { environment } from '@env/environment';

@Component({
  selector: 'stc-debug-user-banner',
  standalone: true,
  imports: [MatCardModule, NgIf, JsonPipe, AsyncPipe],
  templateUrl: './debug-user-banner.component.html',
  styleUrls: ['./debug-user-banner.component.scss'],
})
export class DebugUserBannerComponent {
  @Input() user: unknown;
  readonly show = environment.showAuthDebugBar;
}
