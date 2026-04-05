import { Routes } from '@angular/router';
import { MosaicComponent } from './mosaic/mosaic';
import { PlasmaOrbComponent } from './plasma-orb/plasma-orb';
import { SpectrumBandsComponent } from './spectrum-bands/spectrum-bands';
import { ContourFieldComponent } from './contour-field/contour-field';
import { RadialDiscComponent } from './radial-disc/radial-disc';
import { PencilSphereComponent } from './pencil-sphere/pencil-sphere';
import { WaveWeaveComponent } from './wave-weave/wave-weave';

export const routes: Routes = [
  { path: '',         component: PlasmaOrbComponent },
  { path: 'mosaic',   component: MosaicComponent },
  { path: 'spectrum', component: SpectrumBandsComponent },
  { path: 'contour',  component: ContourFieldComponent },
  { path: 'radial',   component: RadialDiscComponent },
  { path: 'pencil',   component: PencilSphereComponent },
  { path: 'weave',    component: WaveWeaveComponent },
  { path: '**',       redirectTo: '' },
];
