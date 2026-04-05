import {
  Component, ElementRef, ViewChild, AfterViewInit, OnDestroy, NgZone,
} from '@angular/core';
import gsap from 'gsap';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Wave {
  readonly fx: number;   // x-frequency multiplier
  readonly fy: number;   // y-frequency multiplier
  readonly ph: number;   // base phase
  readonly spd: number;  // animation speed
  readonly amp: number;  // amplitude
}

// ─── Component ───────────────────────────────────────────────────────────────

/**
 * Contour Field — neon topographic isolines drawn with the marching squares
 * algorithm on a superimposed sine-wave scalar field, animated by GSAP.
 */
@Component({
  selector: 'app-contour-field',
  standalone: true,
  template: `<canvas #canvas></canvas>`,
  styles: [`
    :host { display:block; position:fixed; inset:0; background:#050620; }
    canvas { display:block; }
  `],
})
export class ContourFieldComponent implements AfterViewInit, OnDestroy {
  @ViewChild('canvas') canvasRef!: ElementRef<HTMLCanvasElement>;

  private ctx!: CanvasRenderingContext2D;
  private W = 0;
  private H = 0;

  // Pre-allocated grid reused every frame
  private grid!: Float32Array;
  private COLS = 0;
  private ROWS = 0;

  private readonly LEVELS = 30;
  private readonly CELL_PX = 9;  // pixels per grid cell — ~10px gives tight density

  // Neon hues cycling through violet → blue → cyan → yellow → orange → red → magenta
  private readonly NEON_HUES = [
    220, 240, 262, 282, 308, 328, 348, 6, 24, 44, 60, 78, 155, 178, 200,
  ] as const;

  // Ten overlapping sine waves at varied angles and speeds create dense topology
  private readonly WAVES: Wave[] = [
    { fx: 2.0, fy: 1.5, ph: 0.00, spd: 0.22, amp: 1.00 },
    { fx: 1.2, fy: 2.8, ph: 1.26, spd: 0.14, amp: 0.88 },
    { fx: 3.4, fy: 0.8, ph: 2.51, spd: 0.31, amp: 0.72 },
    { fx: 0.6, fy: 3.5, ph: 3.77, spd: 0.09, amp: 0.95 },
    { fx: 2.7, fy: 2.2, ph: 5.03, spd: 0.18, amp: 0.68 },
    { fx: 1.5, fy: 1.0, ph: 0.94, spd: 0.25, amp: 0.78 },
    { fx: 4.1, fy: 3.0, ph: 2.20, spd: 0.12, amp: 0.55 },
    { fx: 1.0, fy: 4.3, ph: 1.57, spd: 0.10, amp: 0.82 },
    { fx: 3.2, fy: 1.6, ph: 3.45, spd: 0.20, amp: 0.62 },
    { fx: 2.1, fy: 3.7, ph: 5.18, spd: 0.15, amp: 0.71 },
  ];

  // GSAP-driven time values — fieldTime drives the field evolution,
  // colorPhase rotates the hue assignments to create a shifting colour wave
  private anim = { fieldTime: 0, colorPhase: 0 };
  private tweens: gsap.core.Tween[] = [];
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

      // Derive grid dimensions from cell size so cells are approximately square
      this.COLS = Math.ceil(this.W / this.CELL_PX);
      this.ROWS = Math.ceil(this.H / this.CELL_PX);
      this.grid = new Float32Array((this.ROWS + 1) * (this.COLS + 1));

      this.startAnimations();
      this.tickerFn = () => this.draw();
      gsap.ticker.add(this.tickerFn);
      gsap.ticker.fps(60);
    });
  }

  ngOnDestroy() {
    gsap.ticker.remove(this.tickerFn);
    this.tweens.forEach(t => t.kill());
    gsap.killTweensOf(this.anim);
  }

  // ─── Animations ──────────────────────────────────────────────────────────

  private startAnimations() {
    // Advance field continuously — non-repeating int target avoids discontinuity
    this.tweens.push(
      gsap.to(this.anim, {
        fieldTime: 2000,
        duration:  4000,
        ease:      'none',
        repeat:    -1,
      })
    );

    // Full 360° hue rotation every 26 seconds — makes colour bands slowly drift
    this.tweens.push(
      gsap.to(this.anim, {
        colorPhase: 360,
        duration:   26,
        ease:       'none',
        repeat:     -1,
      })
    );
  }

  // ─── Scalar field ────────────────────────────────────────────────────────

  /** Evaluate the superimposed-sine scalar field at normalised coords (0..1). */
  private sampleField(nx: number, ny: number): number {
    const t = this.anim.fieldTime * 0.01;
    let v = 0;
    for (const w of this.WAVES) {
      v += w.amp * Math.sin(
        w.fx * nx * Math.PI * 2 +
        w.fy * ny * Math.PI * 2 +
        w.ph + t * w.spd,
      );
    }
    return v;
  }

  // ─── Render loop ─────────────────────────────────────────────────────────

  private draw() {
    const { ctx, W, H, grid, COLS, ROWS, LEVELS } = this;
    const cx = W / 2;
    const cy = H / 2;
    const R  = Math.min(W, H) * 0.46;
    const cW = W / COLS;
    const cH = H / ROWS;
    const stride = COLS + 1;

    // Clear
    ctx.fillStyle = '#050620';
    ctx.fillRect(0, 0, W, H);

    // ── 1. Build scalar field grid ──────────────────────────────────────────
    let fMin =  Infinity;
    let fMax = -Infinity;

    for (let r = 0; r <= ROWS; r++) {
      const ny = r / ROWS;
      const base = r * stride;
      for (let c = 0; c <= COLS; c++) {
        const v = this.sampleField(c / COLS, ny);
        grid[base + c] = v;
        if (v < fMin) fMin = v;
        if (v > fMax) fMax = v;
      }
    }

    const step = (fMax - fMin) / (LEVELS + 1);

    // ── 2. Clip canvas to circle ────────────────────────────────────────────
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.clip();
    ctx.globalCompositeOperation = 'screen';

    // ── 3. Marching-squares isolines per level (one batched stroke call) ────
    for (let lvl = 0; lvl < LEVELS; lvl++) {
      const threshold = fMin + step * (lvl + 1);

      // Hue cycles through neon palette with a global drift offset
      const hue = (this.NEON_HUES[lvl % this.NEON_HUES.length] + this.anim.colorPhase) % 360;
      const sat = 72 + (lvl % 4) * 5;
      const lit = 44 + (lvl % 6) * 6;

      ctx.strokeStyle = `hsl(${hue},${sat}%,${lit}%)`;
      ctx.lineWidth   = 0.7 + (lvl % 5) * 0.20;
      ctx.globalAlpha = 0.48 + (lvl % 4) * 0.10;
      ctx.lineCap     = 'round';

      ctx.beginPath();  // single path per level — one stroke() call

      for (let r = 0; r < ROWS; r++) {
        const rowBase  = r * stride;
        const nextBase = rowBase + stride;

        for (let c = 0; c < COLS; c++) {
          const TL = grid[rowBase  + c    ];
          const TR = grid[rowBase  + c + 1];
          const BL = grid[nextBase + c    ];
          const BR = grid[nextBase + c + 1];

          // Case index: bit3=TL, bit2=TR, bit1=BR, bit0=BL
          const idx = ((TL >= threshold ? 1 : 0) << 3)
                    | ((TR >= threshold ? 1 : 0) << 2)
                    | ((BR >= threshold ? 1 : 0) << 1)
                    |  (BL >= threshold ? 1 : 0);

          if (idx === 0 || idx === 15) continue;

          // Linear interpolation along each edge
          const iTop = lerpT(TL, TR, threshold);
          const iRgt = lerpT(TR, BR, threshold);
          const iBtm = lerpT(BL, BR, threshold);
          const iLft = lerpT(TL, BL, threshold);

          // Edge midpoint world coordinates
          const tpx = (c + iTop) * cW;  const tpy = r * cH;           // top
          const rex = (c + 1)    * cW;  const rey = (r + iRgt) * cH;  // right
          const btx = (c + iBtm) * cW;  const bty = (r + 1)    * cH; // bottom
          const lfx = c          * cW;  const lfy = (r + iLft) * cH; // left

          // Marching squares line segments (14 non-trivial cases)
          switch (idx) {
            case  1: ctx.moveTo(lfx,lfy); ctx.lineTo(btx,bty); break;
            case  2: ctx.moveTo(btx,bty); ctx.lineTo(rex,rey); break;
            case  3: ctx.moveTo(lfx,lfy); ctx.lineTo(rex,rey); break;
            case  4: ctx.moveTo(tpx,tpy); ctx.lineTo(rex,rey); break;
            // Saddle — TR+BL: each inside corner gets its own arc
            case  5: ctx.moveTo(tpx,tpy); ctx.lineTo(rex,rey);
                     ctx.moveTo(lfx,lfy); ctx.lineTo(btx,bty); break;
            case  6: ctx.moveTo(tpx,tpy); ctx.lineTo(btx,bty); break;
            case  7: ctx.moveTo(lfx,lfy); ctx.lineTo(tpx,tpy); break;
            case  8: ctx.moveTo(lfx,lfy); ctx.lineTo(tpx,tpy); break;
            case  9: ctx.moveTo(tpx,tpy); ctx.lineTo(btx,bty); break;
            // Saddle — TL+BR: each inside corner gets its own arc
            case 10: ctx.moveTo(lfx,lfy); ctx.lineTo(tpx,tpy);
                     ctx.moveTo(btx,bty); ctx.lineTo(rex,rey); break;
            case 11: ctx.moveTo(tpx,tpy); ctx.lineTo(rex,rey); break;
            case 12: ctx.moveTo(lfx,lfy); ctx.lineTo(rex,rey); break;
            case 13: ctx.moveTo(btx,bty); ctx.lineTo(rex,rey); break;
            case 14: ctx.moveTo(lfx,lfy); ctx.lineTo(btx,bty); break;
          }
        }
      }

      ctx.stroke();
    }

    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.restore();
  }
}

// ─── Pure utility — placed outside class so V8 can inline it in the hot loop ─

/** Return interpolation fraction [0,1] of threshold between two field values. */
function lerpT(va: number, vb: number, threshold: number): number {
  const d = vb - va;
  return d === 0 ? 0.5 : Math.max(0, Math.min(1, (threshold - va) / d));
}
