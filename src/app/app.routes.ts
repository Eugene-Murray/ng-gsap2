import { Routes } from '@angular/router';
import { MosaicComponent } from './mosaic/mosaic';
import { PlasmaOrbComponent } from './plasma-orb/plasma-orb';
import { SpectrumBandsComponent } from './spectrum-bands/spectrum-bands';

export const routes: Routes = [
  { path: '',         component: PlasmaOrbComponent },
  { path: 'mosaic',   component: MosaicComponent },
  { path: 'spectrum', component: SpectrumBandsComponent },
  { path: '**',       redirectTo: '' },
];
