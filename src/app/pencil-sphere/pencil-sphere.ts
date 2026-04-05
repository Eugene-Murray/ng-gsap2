import {
  Component, ElementRef, ViewChild, AfterViewInit, OnDestroy, NgZone,
} from '@angular/core';
import gsap from 'gsap';

// ─── Component ───────────────────────────────────────────────────────────────

/**
 * Pencil Sphere — a coaxial circle pencil: every circle in the family passes
 * through the same two "pole" points on the vertical axis. This creates the
 * interlocking sphere-cage with a bright converging spine seen in the image.
 *
 * Math:
 *   Poles at P₁ = (0, +d) and P₂ = (0, −d).
 *   A circle through both poles satisfies x² + y² + Cx·x − d² = 0,
 *   i.e. centre = (−Cx/2, 0),  radius = √(d² + (Cx/2)²).
 *   By sweeping Cx from −maxCx to +maxCx we get the full left/right family.
 *
 *   GSAP rotates the entire scene, breathes the pole distance, and slowly
 *   oscillates per-layer opacity to produce and evolving cage spin.
 */
@Component({
  selector: 'app-pencil-sphere',
  standalone: true,
  template: `<canvas #canvas></canvas>`,
  styles: [`
    :host { display:block; position:fixed; inset:0; background:#f4f4f4; }
    canvas { display:block; }
  `],
})
export class PencilSphereComponent implements AfterViewInit, OnDestroy {
  @ViewChild('canvas') canvasRef!: ElementRef<HTMLCanvasElement>;

  private ctx!: CanvasRenderingContext2D;
  private W = 0;
  private H = 0;

  // All GSAP-driven state — each property controlled by exactly one tween
  private state = {
    rotAngle:   -Math.PI / 2,   // global canvas rotation (spine starts vertical)
    poleF:       0.91,          // pole distance as fraction of R
    poleFB:      0.85,          // second-layer pole as fraction — offset for moiré
    alpha:       0.10,          // per-stroke alpha
    scaleA:      1.00,          // layer-A scale breathe
    scaleB:      0.97,          // layer-B scale (offset phase)
    lineW:       0.60,          // stroke width
    spiralDrift: 0.00,          // slow angular offset between the two layers
  };

  // Two concentric layers give the "double-traced hairy outline" look
  private readonly CIRCLES_PER_LAYER = 72;
  private readonly MAX_CX_FACTOR     = 3.6;   // maxCx = R * this

  private tweens: (gsap.core.Tween | gsap.core.Timeline)[] = [];
  private tickerFn!: () => void;

  constructor(private ngZone: NgZone) {}

  ngAfterViewInit() {
    this.ngZone.runOutsideAngular(() => {
      const canvas = this.canvasRef.nativeElement;
      this.W = window.innerWidth;
      this.H = window.innerHeight;
      canvas.width  = this.W;
      canvas.height = this.H;
      this.ctx = canvas.getContext('2d')!;
      this.startAnimations();
      this.tickerFn = () => this.draw();
      gsap.ticker.add(this.tickerFn);
      gsap.ticker.fps(60);
    });
  }

  ngOnDestroy() {
    gsap.ticker.remove(this.tickerFn);
    this.tweens.forEach(t => t.kill());
    gsap.killTweensOf(this.state);
  }

  // ─── GSAP animations ──────────────────────────────────────────────────────

  private startAnimations() {
    // Continuous full rotation — 22 s per revolution, steady
    this.tweens.push(
      gsap.to(this.state, {
        rotAngle: -Math.PI / 2 + Math.PI * 2 * 1000,
        duration: 22000,
        ease:     'none',
        repeat:   -1,
      })
    );

    // Pole A breathe — tightens and loosens the spine convergence
    this.tweens.push(
      gsap.to(this.state, {
        poleF: 0.97,
        duration: 5.2,
        ease:     'sine.inOut',
        yoyo:     true,
        repeat:   -1,
      })
    );

    // Pole B tracks A with a phase offset — creates slow moiré ripple
    this.tweens.push(
      gsap.to(this.state, {
        poleFB: 0.93,
        duration: 6.8,
        ease:     'sine.inOut',
        yoyo:     true,
        repeat:   -1,
        delay:    1.7,
      })
    );

    // Alpha fade — the cage darkens and lightens
    this.tweens.push(
      gsap.to(this.state, {
        alpha: 0.065,
        duration: 8.0,
        ease:     'sine.inOut',
        yoyo:     true,
        repeat:   -1,
        delay:    0.5,
      })
    );

    // Scale A breathe — layer A subtly pulses
    this.tweens.push(
      gsap.to(this.state, {
        scaleA: 1.018,
        duration: 4.4,
        ease:     'sine.inOut',
        yoyo:     true,
        repeat:   -1,
      })
    );

    // Scale B breathe (out of phase) — the two layers drift in/out relative to each other
    this.tweens.push(
      gsap.to(this.state, {
        scaleB: 1.00,
        duration: 3.9,
        ease:     'sine.inOut',
        yoyo:     true,
        repeat:   -1,
        delay:    2.1,
      })
    );

    // Spiral drift — the two layers slowly counter-rotate by a few degrees,
    // causing the bright spine to subtly "feather" over time
    this.tweens.push(
      gsap.to(this.state, {
        spiralDrift: Math.PI / 18,   // ±10°
        duration:    9.5,
        ease:        'sine.inOut',
        yoyo:        true,
        repeat:      -1,
        delay:       3.0,
      })
    );

    // Line width breathe — strokes thicken slightly as the alpha drops
    this.tweens.push(
      gsap.to(this.state, {
        lineW: 0.85,
        duration: 7.0,
        ease:     'sine.inOut',
        yoyo:     true,
        repeat:   -1,
        delay:    1.2,
      })
    );
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  private draw() {
    const { ctx, W, H, state, CIRCLES_PER_LAYER, MAX_CX_FACTOR } = this;
    const cx = W / 2;
    const cy = H / 2;
    const R  = Math.min(W, H) * 0.43;

    // Background
    ctx.fillStyle = '#f4f4f4';
    ctx.fillRect(0, 0, W, H);

    // ── Layer A ────────────────────────────────────────────────────────────
    this.drawLayer(
      cx, cy, R,
      state.rotAngle,
      state.poleF * R * state.scaleA,
      state.alpha,
      state.lineW,
      CIRCLES_PER_LAYER,
      MAX_CX_FACTOR,
    );

    // ── Layer B (slight angular offset + different pole) ───────────────────
    this.drawLayer(
      cx, cy, R,
      state.rotAngle + state.spiralDrift,
      state.poleFB * R * state.scaleB,
      state.alpha * 0.72,
      state.lineW * 0.85,
      CIRCLES_PER_LAYER,
      MAX_CX_FACTOR * 1.08,
    );
  }

  private drawLayer(
    cx: number, cy: number, clipR: number,
    rotAngle: number,
    poleD: number,
    alpha: number,
    lineW: number,
    N: number,
    maxFactor: number,
  ) {
    const { ctx } = this;
    const maxCx = clipR * maxFactor;

    ctx.save();

    // Clip to bounding circle
    ctx.beginPath();
    ctx.arc(cx, cy, clipR, 0, Math.PI * 2);
    ctx.clip();

    // Rotate canvas so the spine (which starts vertical) moves with rotAngle
    ctx.translate(cx, cy);
    ctx.rotate(rotAngle);

    ctx.strokeStyle = `rgba(0,0,0,${alpha.toFixed(4)})`;
    ctx.lineWidth   = lineW;
    ctx.lineCap     = 'round';

    for (let i = 0; i < N; i++) {
      // Evenly spaced Cx from −maxCx … +maxCx, skipping near-zero
      // (near-zero Cx → giant flat circles that add nothing useful)
      const t  = (i / (N - 1)) * 2 - 1;          // −1 … +1

      // Mild cubic remapping: packs more circles near the poles (|Cx| large)
      // which matches the feathery outer edge visible in the reference image
      const tR = Math.sign(t) * Math.pow(Math.abs(t), 0.72);
      const Cx = tR * maxCx;

      if (Math.abs(Cx) < clipR * 0.05) continue;  // skip degenerate large circles

      // Coaxial circle: centre = (−Cx/2, 0), radius = √(poleD² + (Cx/2)²)
      const circleCx = -Cx / 2;
      const circleR  = Math.sqrt(poleD * poleD + (Cx / 2) * (Cx / 2));

      ctx.beginPath();
      ctx.arc(circleCx, 0, circleR, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.restore();
  }
}
