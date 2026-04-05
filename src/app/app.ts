import { Component } from '@angular/core';
import { MosaicComponent } from './mosaic/mosaic';

@Component({
  selector: 'app-root',
  imports: [MosaicComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {}
