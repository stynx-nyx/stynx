// C-4 Session S3-2 — hand-finished feature module
//
// Original scaffold (D-A-15):
//   - imported `./guards/cognito.guard` and `./policy.guard` that the
//     scaffolder never emitted
//   - exported `class __NsModulePascal__FeatureModule {}` (unsubstituted
//     template variable)
//
// Hand-finishing for S3-2-step-2: when @stynx-web/angular's auth guard
// pattern is wired, add canActivate guards to the routes.

import { CommonModule } from '@angular/common';
import { HttpClientModule } from '@angular/common/http';
import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { BookmarkListComponent } from './bookmark-list.component';
import { BookmarkDetailComponent } from './bookmark-detail.component';
import { BookmarkService } from './bookmark.service';

const routes: Routes = [
  { path: '', component: BookmarkListComponent },
  { path: ':id', component: BookmarkDetailComponent },
];

@NgModule({
  imports: [
    CommonModule,
    HttpClientModule,
    RouterModule.forChild(routes),
    BookmarkListComponent,
    BookmarkDetailComponent,
  ],
  providers: [BookmarkService],
})
export class DemoBookmarkFeatureModule {}
