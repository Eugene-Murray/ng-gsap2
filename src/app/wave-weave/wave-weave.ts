import {
  Component, ElementRef, ViewChild, AfterViewInit, OnDestroy, NgZone,
} from '@angular/core';
import gsap from 'gsap';

interface ClipBox { x1: number; x2: number; y1: number; y2: number; }

// ─── Component ───────────────────────────────────────────────────────────────

/**
 * Wave Weave — two families of sinusoidal ribbons (horizontal + vertical)
 * drawn with a 3-pass canvas clipping technique to produce a physically
 * correct over/under loom-weave pattern.
 *
 * Drawing passes per frame:
 *   1. UNDER ribbon segments clipped to each crossing box
 *   2. Free ribbon segments (between all crossings)
 *   3. OVER ribbon segments clipped to each crossing box
 *
 * GSAP animates phaseH / phaseV (waves continuously flow), amplitude and
 * ribbon-width breathes, and a slow frequency oscillation — all on
 * independent state properties so there are zero GSAP conflicts.
 */
@Component({
  selector: 'app-wave-weave',
  standalone: true,
  template: `<canvas #canvas></canvas>`,
  styles: [`
    :host { display:block; position:fixed; inset:0; background:#c0c0c0; }
    canvas { display:block; }
  `],
})
export class WaveWeaveComponent implements AfterViewInit, OnDestroy {
  @ViewChild('canvas') canvasRef!: ElementRef<HTMLCanvasElement>;

  private ctx!: CanvasRenderingContext2D;
  private W = 0;
  private H = 0;

  private readonly N_H    = 5;   // horizontal ribbon count (4 cell rows)
  private readonly N_V    = 7;   // vertical ribbon count   (6 cell columns)
  private readonly STEP   = 4;   // canvas path step in px
  private readonly STRAND = 9;   // strands per ribbon

  // All GSAP-driven, all independent properties
  private state = {
    phaseH:   0,       // H-wave phase — flows rightward
    phaseV:   0,       // V-wave phase — flows downward
    ampFrac:  0.44,    // wave amplitude as fraction of min-spacing
    wFrac:    0.42,    // ribbon half-width as fraction of min-spacing
    freqMult: 1.0,     // global frequency scale
  };

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
    // H waves flow right — target is exact integer×2π so the repeat is seamless
    this.tweens.push(
      gsap.to(this.state, {
        phaseH:   -Math.PI * 2 * 2000,
        duration:  4000,
        ease:     'none',
        repeat:   -1,
      })
    );

    // V waves flow down, ~20% slower → async relative phase creates life
    this.tweens.push(
      gsap.to(this.state, {
        phaseV:   Math.PI * 2 * 2000,
        duration:  4800,
        ease:     'none',
        repeat:   -1,
      })
    );

    // Amplitude breathe — ribbons swell and narrow
    this.tweens.push(
      gsap.to(this.state, {
        ampFrac:  0.56,
        duration:  4.5,
        ease:     'sine.inOut',
        yoyo:     true,
        repeat:   -1,
      })
    );

    // Ribbon-width breathe (out of phase with amplitude)
    this.tweens.push(
      gsap.to(this.state, {
        wFrac:   0.50,
        duration: 6.0,
        ease:     'sine.inOut',
        yoyo:     true,
        repeat:   -1,
        delay:    1.8,
      })
    );

    // Frequency drift — spacing between peaks slowly tightens/loosens
    this.tweens.push(
      gsap.to(this.state, {
        freqMult: 1.14,
        duration:  7.5,
        ease:     'sine.inOut',
        yoyo:     true,
        repeat:   -1,
        delay:    0.6,
      })
    );
  }

  // ─── Main render ──────────────────────────────────────────────────────────

  private draw() {
    const { ctx, W, H, N_H, N_V, state } = this;
    const cx = W / 2;
    const cy = H / 2;

    // Layout
    const mx = W * 0.06;
    const my = H * 0.10;
    const spacingH = (H - 2 * my) / (N_H - 1);
    const spacingV = (W - 2 * mx) / (N_V - 1);
    const ms  = Math.min(spacingH, spacingV);
    const amp = ms * state.ampFrac;
    const rHW = ms * state.wFrac;

    // One full sine period per cell
    const freqH = (2 * Math.PI / spacingV) * state.freqMult;
    const freqV = (2 * Math.PI / spacingH) * state.freqMult;

    const yCenters = Array.from({ length: N_H }, (_, i) => my + i * spacingH);
    const xCenters = Array.from({ length: N_V }, (_, j) => mx + j * spacingV);
    const pH = state.phaseH;
    const pV = state.phaseV;

    // Crossing zones must not overlap adjacent crossings → clamp
    const cHW = Math.min(rHW + amp, spacingV * 0.47);
    const cHH = Math.min(rHW + amp, spacingH * 0.47);

    // Background
    ctx.fillStyle = '#c0c0c0';
    ctx.fillRect(0, 0, W, H);

    // Clip scene to ellipse
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(cx, cy, W * 0.44, H * 0.38, 0, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = '#efefef';
    ctx.fill();

    // ── Pass 1: UNDER ribbons at each crossing ─────────────────────────────
    for (let i = 0; i < N_H; i++) {
      for (let j = 0; j < N_V; j++) {
        const box = this.box(xCenters[j], yCenters[i], cHW, cHH);
        if ((i + j) % 2 === 0) {
          // H over V → V is under
          this.vClipped(xCenters[j], freqV, pV, amp, rHW, box);
        } else {
          // V over H → H is under
          this.hClipped(yCenters[i], freqH, pH, amp, rHW, box);
        }
      }
    }

    // ── Pass 2: Free ribbon segments (between all crossings) ───────────────
    for (let i = 0; i < N_H; i++) {
      this.hFree(yCenters[i], freqH, pH, amp, rHW, xCenters, cHW);
    }
    for (let j = 0; j < N_V; j++) {
      this.vFree(xCenters[j], freqV, pV, amp, rHW, yCenters, cHH);
    }

    // ── Pass 3: OVER ribbons at each crossing ──────────────────────────────
    for (let i = 0; i < N_H; i++) {
      for (let j = 0; j < N_V; j++) {
        const box = this.box(xCenters[j], yCenters[i], cHW, cHH);
        if ((i + j) % 2 === 0) {
          this.hClipped(yCenters[i], freqH, pH, amp, rHW, box);
        } else {
          this.vClipped(xCenters[j], freqV, pV, amp, rHW, box);
        }
      }
    }

    ctx.restore();
  }

  // ─── Clipped draw helpers ─────────────────────────────────────────────────

  private hClipped(cy: number, freq: number, ph: number, amp: number, hw: number, b: ClipBox) {
    const { ctx, W } = this;
    ctx.save();
    ctx.beginPath();
    ctx.rect(b.x1, b.y1, b.x2 - b.x1, b.y2 - b.y1);
    ctx.clip();
    this.fillH(cy, freq, ph, amp, hw, Math.max(0, b.x1 - 1), Math.min(W, b.x2 + 1));
    ctx.restore();
  }

  private vClipped(cx: number, freq: number, ph: number, amp: number, hw: number, b: ClipBox) {
    const { ctx, H } = this;
    ctx.save();
    ctx.beginPath();
    ctx.rect(b.x1, b.y1, b.x2 - b.x1, b.y2 - b.y1);
    ctx.clip();
    this.fillV(cx, freq, ph, amp, hw, Math.max(0, b.y1 - 1), Math.min(H, b.y2 + 1));
    ctx.restore();
  }

  private hFree(cy: number, freq: number, ph: number, amp: number, hw: number,
                xC: number[], cHW: number) {
    const { ctx, W, H } = this;
    const xs = [0, ...xC.flatMap(x => [x - cHW, x + cHW]), W];
    for (let k = 0; k < xs.length - 1; k += 2) {
      const x1 = xs[k], x2 = xs[k + 1];
      if (x2 <= x1 + 2) continue;
      ctx.save();
      ctx.beginPath();
      ctx.rect(x1, 0, x2 - x1, H);
      ctx.clip();
      this.fillH(cy, freq, ph, amp, hw, x1, x2);
      ctx.restore();
    }
  }

  private vFree(cx: number, freq: number, ph: number, amp: number, hw: number,
                yC: number[], cHH: number) {
    const { ctx, W, H } = this;
    const ys = [0, ...yC.flatMap(y => [y - cHH, y + cHH]), H];
    for (let k = 0; k < ys.length - 1; k += 2) {
      const y1 = ys[k], y2 = ys[k + 1];
      if (y2 <= y1 + 2) continue;
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, y1, W, y2 - y1);
      ctx.clip();
      this.fillV(cx, freq, ph, amp, hw, y1, y2);
      ctx.restore();
    }
  }

  // ─── Ribbon primitives ────────────────────────────────────────────────────

  /** Draw a horizontal sinusoidal ribbon (fill + strand lines) from x1..x2. */
  private fillH(cy: number, freq: number, ph: number, amp: number,
                hw: number, x1: number, x2: number) {
    const { ctx } = this;
    const S = this.STEP;

    // Filled body
    ctx.fillStyle = 'rgba(10,10,10,0.27)';
    ctx.beginPath();
    let first = true;
    for (let x = x1; x <= x2 + S; x += S) {
      const xc = Math.min(x, x2);
      const y  = cy - hw + amp * Math.sin(freq * xc + ph);
      first ? (ctx.moveTo(xc, y), first = false) : ctx.lineTo(xc, y);
      if (xc === x2) break;
    }
    for (let x = x2; x >= x1 - S; x -= S) {
      const xc = Math.max(x, x1);
      ctx.lineTo(xc, cy + hw + amp * Math.sin(freq * xc + ph));
      if (xc === x1) break;
    }
    ctx.closePath();
    ctx.fill();

    // Strand lines within ribbon
    ctx.strokeStyle = 'rgba(0,0,0,0.036)';
    ctx.lineWidth   = 0.55;
    const K = this.STRAND;
    for (let s = 0; s < K; s++) {
      const off = ((s / (K - 1)) - 0.5) * 2 * hw;
      first = true;
      ctx.beginPath();
      for (let x = x1; x <= x2 + S; x += S) {
        const xc = Math.min(x, x2);
        const y  = cy + off + amp * Math.sin(freq * xc + ph);
        first ? (ctx.moveTo(xc, y), first = false) : ctx.lineTo(xc, y);
        if (xc === x2) break;
      }
      ctx.stroke();
    }
  }

  /** Draw a vertical sinusoidal ribbon (fill + strand lines) from y1..y2. */
  private fillV(cx: number, freq: number, ph: number, amp: number,
                hw: number, y1: number, y2: number) {
    const { ctx } = this;
    const S = this.STEP;

    ctx.fillStyle = 'rgba(10,10,10,0.27)';
    ctx.beginPath();
    let first = true;
    for (let y = y1; y <= y2 + S; y += S) {
      const yc = Math.min(y, y2);
      const x  = cx - hw + amp * Math.sin(freq * yc + ph);
      first ? (ctx.moveTo(x, yc), first = false) : ctx.lineTo(x, yc);
      if (yc === y2) break;
    }
    for (let y = y2; y >= y1 - S; y -= S) {
      const yc = Math.max(y, y1);
      ctx.lineTo(cx + hw + amp * Math.sin(freq * yc + ph), yc);
      if (yc === y1) break;
    }
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = 'rgba(0,0,0,0.036)';
    ctx.lineWidth   = 0.55;
    const K = this.STRAND;
    for (let s = 0; s < K; s++) {
      const off = ((s / (K - 1)) - 0.5) * 2 * hw;
      first = true;
      ctx.beginPath();
      for (let y = y1; y <= y2 + S; y += S) {
        const yc = Math.min(y, y2);
        const x  = cx + off + amp * Math.sin(freq * yc + ph);
        first ? (ctx.moveTo(x, yc), first = false) : ctx.lineTo(x, yc);
        if (yc === y2) break;
      }
      ctx.stroke();
    }
  }

  // ─── Utility ─────────────────────────────────────────────────────────────

  private box(cx: number, cy: number, hw: number, hh: number): ClipBox {
    return { x1: cx - hw, x2: cx + hw, y1: cy - hh, y2: cy + hh };
  }
}
