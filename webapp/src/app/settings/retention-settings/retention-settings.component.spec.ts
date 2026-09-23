import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RetentionSettingsComponent } from './retention-settings.component';

describe('RetentionSettingsComponent', () => {
  let component: RetentionSettingsComponent;
  let fixture: ComponentFixture<RetentionSettingsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [RetentionSettingsComponent],
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(RetentionSettingsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
