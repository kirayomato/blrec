import { ComponentFixture, TestBed } from '@angular/core/testing';

import { GotifySettingsComponent } from './gotify-settings.component';

describe('GotifySettingsComponent', () => {
  let component: GotifySettingsComponent;
  let fixture: ComponentFixture<GotifySettingsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [GotifySettingsComponent]
    })
      .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(GotifySettingsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
