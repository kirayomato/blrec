import { ComponentFixture, TestBed } from '@angular/core/testing';

import { GotifyNotificationSettingsComponent } from './gotify-notification-settings.component';

describe('GotifyNotificationSettingsComponent', () => {
  let component: GotifyNotificationSettingsComponent;
  let fixture: ComponentFixture<GotifyNotificationSettingsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [GotifyNotificationSettingsComponent]
    })
      .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(GotifyNotificationSettingsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
