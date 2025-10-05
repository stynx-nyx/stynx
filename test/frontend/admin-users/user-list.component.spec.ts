import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { of } from 'rxjs';
import { UserListComponent } from '@admin/users/user-list.component';
import { UsersService } from '@admin/users/users.service';
import { UserSummary } from '@admin/users/models';

describe('UserListComponent', () => {
  let fixture: ComponentFixture<UserListComponent>;
  let component: UserListComponent;
  const users: UserSummary[] = [
    {
      id: 'user-1',
      email: 'user@example.com',
      displayName: 'Example User',
      phoneNumber: '+1 555 555 5555',
      status: 'active',
      groups: ['admins'],
    },
  ];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UserListComponent, RouterTestingModule],
      providers: [
        {
          provide: UsersService,
          useValue: { list: jest.fn().mockReturnValue(of(users)) },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(UserListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('loads users on init', () => {
    expect(component.dataSource.data.length).toBe(1);
    expect(component.dataSource.data[0].displayName).toBe('Example User');
  });
});
