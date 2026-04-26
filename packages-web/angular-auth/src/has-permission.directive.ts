import {
  Directive,
  Input,
} from '@angular/core';
import type { OnDestroy, TemplateRef, ViewContainerRef } from '@angular/core';
import type { Subscription } from 'rxjs';
import type { StynxSessionService } from './session.service';

@Directive({
  selector: '[stynxHasPermission]',
  standalone: true,
})
export class StynxHasPermissionDirective implements OnDestroy {
  private permissions: string[] = [];
  private readonly subscription: Subscription;
  private rendered = false;

  constructor(
    private readonly templateRef: TemplateRef<unknown>,
    private readonly viewContainerRef: ViewContainerRef,
    private readonly session: StynxSessionService,
  ) {
    this.subscription = this.session.active$.subscribe(() => this.render());
  }

  @Input()
  set stynxHasPermission(value: string | string[]) {
    this.permissions = Array.isArray(value) ? value : [value];
    this.render();
  }

  ngOnDestroy(): void {
    this.subscription.unsubscribe();
  }

  private render(): void {
    const allowed = this.session.hasAllPermissions(this.permissions);
    if (allowed && !this.rendered) {
      this.viewContainerRef.createEmbeddedView(this.templateRef);
      this.rendered = true;
      return;
    }
    if (!allowed && this.rendered) {
      this.viewContainerRef.clear();
      this.rendered = false;
    }
  }
}
