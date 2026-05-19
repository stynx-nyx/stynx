import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

export const STYNX_ICON_NAMES = [
  'arrow-right',
  'check',
  'chevron-left',
  'chevron-right',
  'clock',
  'close',
  'error',
  'file',
  'form',
  'info',
  'plus',
  'save',
  'task',
  'trash',
  'user',
  'waiver',
  'warning',
] as const;

export type StynxIconName = (typeof STYNX_ICON_NAMES)[number];

@Component({
  selector: 'stynx-icon',
  standalone: true,
  template: `
    <svg
      class="stynx-icon"
      focusable="false"
      [attr.aria-hidden]="label ? null : 'true'"
      [attr.aria-label]="label || null"
      [attr.role]="label ? 'img' : null"
    >
      <use [attr.href]="href" [attr.xlink:href]="href"></use>
    </svg>
  `,
  styles: [`
    :host {
      display: inline-flex;
      width: var(--stynx-icon-size, 1em);
      height: var(--stynx-icon-size, 1em);
      line-height: 1;
      color: currentColor;
      flex: 0 0 auto;
    }

    .stynx-icon {
      width: 100%;
      height: 100%;
      display: block;
      fill: none;
      stroke: currentColor;
      stroke-width: 2;
      stroke-linecap: round;
      stroke-linejoin: round;
      overflow: visible;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StynxIconComponent {
  @Input({ required: true }) name: StynxIconName | string = 'info';
  @Input() label = '';

  get href(): string {
    return `#${this.name}`;
  }
}
