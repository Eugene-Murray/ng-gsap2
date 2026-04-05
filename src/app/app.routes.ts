import { Routes } from '@angular/router';
import { MosaicComponent } from './mosaic/mosaic';
import { PlasmaOrbComponent } from './plasma-orb/plasma-orb';

export const routes: Routes = [
  { path: '',        component: PlasmaOrbComponent },
  { path: 'mosaic',  component: MosaicComponent },
  { path: '**',      redirectTo: '' },
];
