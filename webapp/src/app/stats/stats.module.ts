import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzGridModule } from 'ng-zorro-antd/grid';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzProgressModule } from 'ng-zorro-antd/progress';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzStatisticModule } from 'ng-zorro-antd/statistic';
import { NzTableModule } from 'ng-zorro-antd/table';
import { NzToolTipModule } from 'ng-zorro-antd/tooltip';

import { SharedModule } from '../shared/shared.module';
import { StatsRoutingModule } from './stats-routing.module';
import { StatsComponent } from './stats.component';

@NgModule({
  declarations: [StatsComponent],
  imports: [
    CommonModule,

    NzButtonModule,
    NzCardModule,
    NzGridModule,
    NzIconModule,
    NzProgressModule,
    NzSpinModule,
    NzStatisticModule,
    NzTableModule,
    NzToolTipModule,

    StatsRoutingModule,
    SharedModule,
  ],
})
export class StatsModule {}
