import {
  Component, ElementRef, ViewChild, AfterViewInit, OnDestroy, NgZone,
} from '@angular/core';
import gsap from 'gsap';

// ─── Component ───────────────────────────────────────────────────────────────

/**
 * Radial Disc — a dense sunburst of radial spokes whose lengths vary
 * sinusoidally by angle, creating a half-filled / half-open phantom-disc
 * illusion. GSAP rotates the "heavy" side continuously and breathes the
 * contrast, producing the slow mesmerising spin seen in the reference image.
 */
@Component({
  selector: 'app-radial-disc',
  standalone: true,
  template: `<canvas #canvas></canvas>`,
  styles: [`
    :host { display:block; position:fixed; inset:0; background:#f5f5f5; }
    canvas { display:block; }
  `],
})
export class RadialDiscComponent implements AfterViewInit, OnDestroy {
  @ViewChild('canvas') canvasRef!: ElementRef<HTMLCanvasElement>;

  private ctx!: CanvasRenderingContext2D;
  private W = 0;
  private H = 0;

  // GSAP-driven state — all independent properties, zero conflicts
  private state = {
    // Angle (radians) pointing toward the "long spoke" side — continuous rotation
    rotAngle: -Math.PI / 2,
    // How extreme the short/long contrast is: 0 = all spokes equal length, 1 = full split
    contrast: 0.70,
    // Overall disc scale breathe
    scale: 1.0,
    // Inner dark-core radius fraction
    coreR: 0.055,
  };

  private readonly SPOKES = 240;       // number of radial lines
  private readonly SPOKE_GAP = 0.38;   // min length as fraction of R (short side)

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
    // Continuous slow rotation of the "heavy / long-spoke" side —
    // a 16-second full revolution feels meditative without being dizzying.
    this.tweens.push(
      gsap.to(this.state, {
        rotAngle: -Math.PI / 2 + Math.PI * 2 * 1000,   // wrap-free large target
        duration: 16000,
        ease:     'none',
        repeat:   -1,
      })
    );

    // Contrast breathe — the split between short and long spokes pulsates,
    // momentarily showing a uniform disc then sharpening back to the split.
    this.tweens.push(
      gsap.to(this.state, {
        contrast: 0.88,
        duration: 4.8,
        ease:     'sine.inOut',
        yoyo:     true,
        repeat:   -1,
      })
    );

    // Subtle scale breathe — disc expands/contracts very slightly
    this.tweens.push(
      gsap.to(this.state, {
        scale: 1.025,
        duration: 3.6,
        ease:     'sine.inOut',
        yoyo:     true,
        repeat:   -1,
        delay:    1.0,
      })
    );

    // Core radius breathe — the inner black dot swells and shrinks
    this.tweens.push(
      gsap.to(this.state, {
        coreR: 0.09,
        duration: 2.4,
        ease:     'power2.inOut',
        yoyo:     true,
        repeat:   -1,
        delay:    0.4,
      })
    );
  }

  // ─── Render loop ──────────────────────────────────────────────────────────

  private draw() {
    const { ctx, W, H, SPOKES, SPOKE_GAP, state } = this;
    const cx = W / 2;
    const cy = H / 2;
    const R  = Math.min(W, H) * 0.44 * state.scale;

    // White background
    ctx.fillStyle = '#f6f6f6';
    ctx.fillRect(0, 0, W, H);

    // ── Clip to circle ───────────────────────────────────────────────────────
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.clip();

    // ── Fill the clipped region with white so outside stays grey ────────────
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(cx - R, cy - R, R * 2, R * 2);

    // ── Draw spokes ──────────────────────────────────────────────────────────
    const angleStep = (Math.PI * 2) / SPOKES;

    for (let i = 0; i < SPOKES; i++) {
      const angle = i * angleStep;

      // Angular distance from the "long-side" reference angle (0 = same direction)
      const delta = angle - state.rotAngle;

      // Cosine maps to [−1, 1]; remap to [minLen, 1.0]
      //   cos = 1  → long side (the "open" semicircle with full radial lines)
      //   cos = −1 → short side (the "filled / dark" semicircle)
      const cosVal   = Math.cos(delta);                    // −1 … +1
      const normalised = (cosVal + 1) / 2;                // 0 … 1
      const minLen   = 1 - state.contrast;                // short-side minimum length
      const lenFrac  = minLen + normalised * (1 - minLen);// minLen … 1

      // Spokes start just outside the glowing core
      const innerR = R * (state.coreR + 0.01);
      const outerR = R * (SPOKE_GAP + (1 - SPOKE_GAP) * lenFrac);

      // Opacity: short spokes are more opaque/dark → creates the filled illusion
      // long spokes are lighter → clearly visible as individual lines on white
      const alpha = 0.08 + (1 - normalised) * 0.78;

      // Stroke width: slightly thicker toward the dark side for density
      const width = 0.35 + (1 - normalised) * 0.45;

      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);

      ctx.beginPath();
      ctx.moveTo(cx + cosA * innerR, cy + sinA * innerR);
      ctx.lineTo(cx + cosA * outerR, cy + sinA * outerR);
      ctx.strokeStyle = `rgba(0,0,0,${alpha.toFixed(3)})`;
      ctx.lineWidth   = width;
      ctx.stroke();
    }

    // ── Radial gradient — dark core fading outward ───────────────────────────
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 0.55);
    grad.addColorStop(0,    `rgba(0,0,0,0.92)`);
    grad.addColorStop(state.coreR * 1.8, `rgba(0,0,0,0.72)`);
    grad.addColorStop(state.coreR * 4,   `rgba(0,0,0,0.20)`);
    grad.addColorStop(0.38, `rgba(0,0,0,0.04)`);
    grad.addColorStop(1,    `rgba(0,0,0,0)`);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, R * 0.55, 0, Math.PI * 2);
    ctx.fill();

    // ── Thin circle outline ──────────────────────────────────────────────────
    ctx.restore();   // remove clip before drawing outline so it sits on top cleanly

    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(0,0,0,0.14)';
    ctx.lineWidth   = 0.8;
    ctx.stroke();
  }
}
