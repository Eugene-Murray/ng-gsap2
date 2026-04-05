import {
  Component, ElementRef, ViewChild, AfterViewInit, OnDestroy, NgZone,
} from '@angular/core';
import gsap from 'gsap';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Band {
  baseY:    number;
  height:   number;
  isAccent: boolean;
  litOsc:   number;   // animated lightness oscillation  (no conflict)
  hueOsc:   number;   // animated hue drift              (no conflict)
  flash:    number;   // animated sparkle                (no conflict)
}

interface BandColor { hue: number; sat: number; lit: number; alpha: number; }

// ─── Component ───────────────────────────────────────────────────────────────

@Component({
  selector: 'app-spectrum-bands',
  standalone: true,
  template: `<canvas #canvas></canvas>`,
  styles: [`
    :host { display:block; position:fixed; inset:0; background:#0e0e0e; }
    canvas { display:block; }
  `],
})
export class SpectrumBandsComponent implements AfterViewInit, OnDestroy {
  @ViewChild('canvas') canvasRef!: ElementRef<HTMLCanvasElement>;

  private ctx!: CanvasRenderingContext2D;
  private W = 0;
  private H = 0;

  private bands:  Band[] = [];
  private themes: BandColor[][] = [];  // [themeIdx][bandIdx]
  private state = { phase: 0 };

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
      this.buildBands();
      this.buildThemes();
      this.startAnimations();
      this.tickerFn = () => this.draw();
      gsap.ticker.add(this.tickerFn);
      gsap.ticker.fps(60);
    });
  }

  ngOnDestroy() {
    gsap.ticker.remove(this.tickerFn);
    this.tweens.forEach(t => t.kill());
    gsap.killTweensOf(this.bands);
    gsap.killTweensOf(this.state);
  }

  // ─── Layout ──────────────────────────────────────────────────────────────

  private buildBands() {
    let y = 0;
    while (y < this.H) {
      const r = Math.random();
      let h: number;
      if      (r < 0.42) h = 1  + Math.floor(Math.random() * 4);   // thin  1–4 px
      else if (r < 0.78) h = 5  + Math.floor(Math.random() * 16);  // mid   5–20 px
      else               h = 21 + Math.floor(Math.random() * 30);   // thick 21–50 px

      const actualH = Math.min(h, this.H - y);

      this.bands.push({
        baseY:    y,
        height:   actualH,
        isAccent: Math.random() < 0.20,
        litOsc:   0,
        hueOsc:   0,
        flash:    0,
      });

      y += h;
    }
  }

  // ─── Colour themes ───────────────────────────────────────────────────────

  private buildThemes() {
    const N = this.bands.length;
    const r = () => Math.random();

    // ── Theme 0: dark sparse — black bg with vivid thin accent lines ─────────
    const t0: BandColor[] = this.bands.map((b, i) => {
      if (b.isAccent) {
        const accentH = [140, 178, 216, 248, 270, 295, 28, 46][i % 8] + (r() - 0.5) * 14;
        return { hue: accentH, sat: 65 + r() * 30, lit: 42 + r() * 38, alpha: 0.65 + r() * 0.35 };
      }
      return { hue: 208 + r() * 44, sat: 5 + r() * 14, lit: 3 + r() * 7, alpha: 0.7 + r() * 0.3 };
    });

    // ── Theme 1: dark rich — roses, warm grays, teals ────────────────────────
    const families1 = [
      () => ({ hue: 330 + r() * 25, sat: 22 + r() * 40, lit: 10 + r() * 26, alpha: 0.82 + r() * 0.18 }),
      () => ({ hue: 192 + r() * 22, sat: 10 + r() * 20, lit: 18 + r() * 32, alpha: 0.80 + r() * 0.20 }),
      () => ({ hue: 168 + r() * 24, sat: 20 + r() * 36, lit: 8  + r() * 20, alpha: 0.80 + r() * 0.20 }),
      () => ({ hue: 342 + r() * 22, sat: 42 + r() * 32, lit: 24 + r() * 22, alpha: 0.85 + r() * 0.15 }),
    ];
    const t1: BandColor[] = this.bands.map((_, i) => families1[i % families1.length]());

    // ── Theme 2: vibrant spectrum — violet → magenta → orange ────────────────
    const t2: BandColor[] = this.bands.map((_, i) => {
      const t  = i / N;
      const hue = (270 + t * 118) % 360;   // 270 violet → 28 orange
      return { hue, sat: 52 + r() * 42, lit: 24 + r() * 40, alpha: 0.88 + r() * 0.12 };
    });

    // ── Theme 3: fire — reds, oranges, ambers, yellows ───────────────────────
    const t3: BandColor[] = this.bands.map((_, i) => {
      const t     = i / N;
      const hue   = ((5 + t * 50 + (r() - 0.5) * 12) + 360) % 360;
      const sat   = 80 + r() * 20;
      const bright = (Math.sin(i * 0.72 + 1.2) + 1) / 2;   // undulating row brightness
      const lit   = Math.max(5, Math.min(92, 12 + bright * 62 + (r() - 0.5) * 10));
      return { hue, sat, lit, alpha: 0.90 + r() * 0.10 };
    });

    this.themes = [t0, t1, t2, t3];
  }

  // ─── GSAP animations ─────────────────────────────────────────────────────

  private startAnimations() {
    const HOLD  = 7;    // seconds to hold each palette
    const TRANS = 2.4;  // seconds to transition between palettes

    // Main palette cycle: 0 → 1 → 2 → 3 → 0 (loops)
    // Each palette gets a HOLD-second display window, separated by TRANS-second morphs.
    // On timeline repeat GSAP resets state.phase to 0; since 4%4===0 there is no visual jump.
    const tl = gsap.timeline({ repeat: -1 });
    let pos = HOLD;                                   // start with initial hold at palette 0
    for (let p = 1; p <= 4; p++) {
      tl.to(this.state, { phase: p, duration: TRANS, ease: 'sine.inOut' }, pos);
      pos += TRANS + HOLD;
    }
    this.tweens.push(tl);

    // Lightness wave — cascades top-to-bottom, rolling brightness ripple
    this.tweens.push(
      gsap.to(this.bands, {
        litOsc: 11,
        duration: 1.4,
        ease: 'sine.inOut',
        stagger: { each: 0.022, from: 'start', repeat: -1, yoyo: true },
      })
    );

    // Hue drift — slow, scattered per-band drift
    this.tweens.push(
      gsap.to(this.bands, {
        hueOsc: 18,
        duration: 6.5,
        ease: 'sine.inOut',
        stagger: { each: 0.055, from: 'random', repeat: -1, yoyo: true },
      })
    );

    // Accent-line sparkles
    this.doFlash();
  }

  private doFlash() {
    const accents = this.bands.filter(b => b.isAccent);
    const run = () => {
      const n = 1 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) {
        const b = accents[Math.floor(Math.random() * accents.length)];
        if (b) {
          gsap.fromTo(b, { flash: 0 }, {
            flash:    25 + Math.random() * 38,
            duration: 0.06 + Math.random() * 0.18,
            ease: 'power2.out',
            yoyo: true,
            repeat: 1 + Math.floor(Math.random() * 2),
          });
        }
      }
      gsap.delayedCall(0.06 + Math.random() * 0.34, run);
    };
    gsap.delayedCall(0.8, run);
  }

  // ─── Render loop ─────────────────────────────────────────────────────────

  private draw() {
    const { ctx, W, H } = this;

    const COL_COUNT = 4;
    const GAP       = 3;
    const colW      = (W - GAP * (COL_COUNT - 1)) / COL_COUNT;

    ctx.fillStyle = '#0e0e0e';
    ctx.fillRect(0, 0, W, H);

    for (let col = 0; col < COL_COUNT; col++) {
      const x = col * (colW + GAP);

      // Each column is offset by one palette step — left = oldest, right = most evolved.
      // All four palette moods are visible simultaneously, slowly rolling left-to-right.
      const rawPhase = ((this.state.phase + col) % 4 + 4) % 4;
      const tA   = Math.floor(rawPhase) % 4;
      const tB   = (tA + 1) % 4;
      const frac = rawPhase - Math.floor(rawPhase);

      const thA = this.themes[tA];
      const thB = this.themes[tB];

      for (let i = 0; i < this.bands.length; i++) {
        const b  = this.bands[i];
        const cA = thA[i];
        const cB = thB[i];

        const hue   = this.lerpHue(cA.hue, cB.hue, frac) + b.hueOsc;
        const sat   = this.lerp(cA.sat,   cB.sat,   frac);
        const lit   = Math.min(96, Math.max(2,
                        this.lerp(cA.lit, cB.lit, frac) + b.litOsc + b.flash));
        const alpha = this.lerp(cA.alpha, cB.alpha, frac);

        ctx.globalAlpha = Math.min(1, Math.max(0, alpha));
        ctx.fillStyle   = `hsl(${((hue % 360) + 360) % 360},${sat}%,${lit}%)`;
        ctx.fillRect(x, b.baseY, colW, b.height);
      }
    }

    ctx.globalAlpha = 1;
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  private lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
  }

  /** Interpolate hues via the shortest arc around the colour wheel. */
  private lerpHue(a: number, b: number, t: number): number {
    const diff = ((b - a) + 540) % 360 - 180;
    return (a + diff * t + 360) % 360;
  }
}
