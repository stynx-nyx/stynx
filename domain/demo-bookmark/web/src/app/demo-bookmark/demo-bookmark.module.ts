// Generated from BP-DEMO-BOOKMARK-001 v0.1.0 sha256:a5553692
/* Generated for demo/Bookmark — spec: 0.1.0 sha: a5553692 */
import { CommonModule } from '@angular/common';
import { HttpClientModule } from '@angular/common/http';
import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { BookmarkListComponent } from './bookmark-list.component';
import { BookmarkDetailComponent } from './bookmark-detail.component';
import { BookmarkService } from './bookmark.service';
import { CognitoGuard } from './guards/cognito.guard';
import { BookmarkPolicyGuard } from './policy.guard';

const routes: Routes = [
  {
    path: '',
    canActivate: [CognitoGuard],
    children: [
      { path: '', component: BookmarkListComponent, canActivate: [BookmarkPolicyGuard], data: { resource: 'bookmark', action: 'read' } },
      { path: ':id', component: BookmarkDetailComponent, canActivate: [BookmarkPolicyGuard], data: { resource: 'bookmark', action: 'read' } },
    ],
  },
];

@NgModule({
  declarations: [BookmarkListComponent, BookmarkDetailComponent],
  imports: [CommonModule, HttpClientModule, RouterModule.forChild(routes)],
  providers: [BookmarkService, CognitoGuard],
})
export class __NsModulePascal__FeatureModule {}
