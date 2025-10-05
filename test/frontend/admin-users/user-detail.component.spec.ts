import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatDialog } from '@angular/material/dialog';
import { UserDetailComponent } from '@admin/users/user-detail.component';
import { UsersService } from '@admin/users/users.service';
import { RolesService } from '@admin/users/roles.service';
import { TenancyService } from '@admin/users/tenancy.service';
import { RoleSummary, TenancySummary, UserDetail } from '@admin/users/models';

describe('UserDetailComponent', () => {
  let fixture: ComponentFixture<UserDetailComponent>;
  let component: UserDetailComponent;

  const detail: UserDetail = {
    id: 'user-1',
    email: 'user@example.com',
    displayName: 'Example User',
    phoneNumber: '+1 555 555 5555',
    status: 'active',
    groups: ['admins'],
    roles: [],
    tenancies: [],
    attributes: {},
    createdAt: new Date().toISOString(),
  };

  const roles: RoleSummary[] = [
    { id: 'role-1', code: 'platform:admin', name: 'Admin' },
  ];

  const tenancies: TenancySummary[] = [
    { id: 'ten-1', code: 'core', name: 'Core Tenancy' },
  ];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UserDetailComponent, RouterTestingModule],
      providers: [
        {
          provide: UsersService,
          useValue: {
            getById: jest.fn().mockReturnValue(of(detail)),
            updateContact: jest.fn().mockReturnValue(of(detail)),
            confirmUser: jest.fn().mockReturnValue(of(void 0)),
            confirmEmail: jest.fn().mockReturnValue(of(void 0)),
            confirmPhone: jest.fn().mockReturnValue(of(void 0)),
          },
        },
        {
          provide: RolesService,
          useValue: {
            list: jest.fn().mockReturnValue(of(roles)),
            assign: jest.fn().mockReturnValue(of(void 0)),
            remove: jest.fn().mockReturnValue(of(void 0)),
          },
        },
        {
          provide: TenancyService,
          useValue: {
            list: jest.fn().mockReturnValue(of(tenancies)),
            assign: jest.fn().mockReturnValue(of(void 0)),
            remove: jest.fn().mockReturnValue(of(void 0)),
          },
        },
        { provide: MatSnackBar, useValue: { open: jest.fn() } },
        { provide: MatDialog, useValue: { open: jest.fn().mockReturnValue({ afterClosed: () => of(true) }) } },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { paramMap: convertToParamMap({ id: 'user-1' }) },
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(UserDetailComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('renders user header information', () => {
    expect(component.user()).not.toBeNull();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('h1')?.textContent).toContain('Example User');
  });
});
