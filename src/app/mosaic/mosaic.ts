import { Component, ElementRef, ViewChild, AfterViewInit, OnDestroy, NgZone } from '@angular/core';
import gsap from 'gsap';

interface Tile {
  x: number;
  y: number;
  w: number;
  h: number;
  baseHue: number;
  baseSat: number;
  baseLit: number;
  baseAlpha: number;
  colGlow: number;    // animated by column-wave tweens (no conflict with other props)
  radialGlow: number; // animated by radial-pulse tween
  sparkGlow: number;  // animated by sparkle tween
  hueShift: number;   // animated by hue-drift tween
  zone: number;       // x-based column zone index
  isCentral: boolean;
}

@Component({
  selector: 'app-mosaic',
  standalone: true,
  template: `<canvas #canvas></canvas>`,
  styles: [`
    :host {
      display: block;
      position: fixed;
      inset: 0;
      overflow: hidden;
      background: #000;
    }
    canvas {
      display: block;
    }
  `],
})
export class MosaicComponent implements AfterViewInit, OnDestroy {
  @ViewChild('canvas') canvasRef!: ElementRef<HTMLCanvasElement>;

  private ctx!: CanvasRenderingContext2D;
  private tiles: Tile[] = [];
  private tweens: (gsap.core.Tween | gsap.core.Timeline)[] = [];
  private tickerFn!: () => void;
  private W = 0;
  private H = 0;

  constructor(private ngZone: NgZone) {}

  ngAfterViewInit() {
    this.ngZone.runOutsideAngular(() => {
      const canvas = this.canvasRef.nativeElement;
      this.W = window.innerWidth;
      this.H = window.innerHeight;
      canvas.width = this.W;
      canvas.height = this.H;
      this.ctx = canvas.getContext('2d')!;
      this.buildTiles();
      this.animateTiles();
      this.tickerFn = this.draw.bind(this);
      gsap.ticker.add(this.tickerFn);
      gsap.ticker.fps(60);
    });
  }

  ngOnDestroy() {
    gsap.ticker.remove(this.tickerFn);
    this.tweens.forEach(t => t.kill());
    gsap.killTweensOf(this.tiles);
  }

  // ─── Tile generation ────────────────────────────────────────────────────────

  private buildTiles() {
    const { W, H } = this;
    const ZONES = 54;

    let y = 0;
    while (y < H) {
      const rowH = 12 + Math.floor(Math.random() * 16); // 12–28 px row height
      let x = 0;
      while (x < W) {
        const tileW = 12 + Math.floor(Math.random() * 18); // 12–30 px tile width
        const actualW = Math.min(tileW, W - x);
        if (actualW < 4) break;

        // Normalised centre position
        const cx = (x + actualW / 2) / W;
        const cy = (y + rowH / 2) / H;
        const dx = cx - 0.5;
        const dy = cy - 0.5;

        // Slight diagonal tilt to create angled geometry (matches image 1)
        const tilt = Math.PI * 0.18;
        const tdx = dx * Math.cos(tilt) - dy * Math.sin(tilt);
        const tdy = dx * Math.sin(tilt) + dy * Math.cos(tilt);
        const dist = Math.sqrt(tdx * tdx + tdy * tdy);

        const zone = Math.min(ZONES - 1, Math.floor(cx * ZONES));
        const r = Math.random();

        let baseHue: number, baseSat: number, baseLit: number, baseAlpha: number;

        if (dist < 0.14) {
          // ── Bright gold core
          baseHue = 40 + r * 12;
          baseSat = 90 + r * 10;
          baseLit = 55 + r * 28;
          baseAlpha = 0.88 + r * 0.12;
        } else if (dist < 0.28) {
          // ── Inner gold ring
          baseHue = 36 + r * 18;
          baseSat = 72 + r * 24;
          baseLit = 28 + r * 32;
          baseAlpha = 0.72 + r * 0.28;
        } else if (dist < 0.46) {
          // ── Mid zone – gold fragments + dark blue mix
          if (r < 0.42) {
            baseHue = 35 + Math.random() * 20;
            baseSat = 42 + Math.random() * 44;
            baseLit = 12 + Math.random() * 26;
            baseAlpha = 0.50 + Math.random() * 0.40;
          } else {
            baseHue = 198 + Math.random() * 68;
            baseSat = 28 + Math.random() * 52;
            baseLit = 8 + Math.random() * 22;
            baseAlpha = 0.45 + Math.random() * 0.45;
          }
        } else {
          // ── Edge chaos zone
          if (r < 0.13) {
            // Vivid accent: blues, purples, teals, magentas, warm-reds
            const accents = [205, 222, 245, 268, 288, 308, 328, 6, 148, 172];
            baseHue = accents[Math.floor(Math.random() * accents.length)] + (Math.random() - 0.5) * 18;
            baseSat = 62 + Math.random() * 38;
            baseLit = 24 + Math.random() * 36;
            baseAlpha = 0.55 + Math.random() * 0.40;
          } else if (r < 0.42) {
            // Mid-dark coloured
            baseHue = 202 + Math.random() * 82;
            baseSat = 16 + Math.random() * 48;
            baseLit = 8 + Math.random() * 26;
            baseAlpha = 0.38 + Math.random() * 0.48;
          } else {
            // Near-black
            baseHue = 218 + Math.random() * 46;
            baseSat = 8 + Math.random() * 22;
            baseLit = 3 + Math.random() * 11;
            baseAlpha = 0.22 + Math.random() * 0.44;
          }
        }

        this.tiles.push({
          x: x + 1,
          y: y + 1,
          w: actualW - 2,
          h: rowH - 2,
          baseHue,
          baseSat,
          baseLit,
          baseAlpha,
          colGlow: 0,
          radialGlow: 0,
          sparkGlow: 0,
          hueShift: 0,
          zone,
          isCentral: dist < 0.26,
        });

        x += tileW;
      }
      y += rowH;
    }
  }

  // ─── GSAP animations  ────────────────────────────────────────────────────────

  private animateTiles() {
    const ZONES = 54;

    // Build zone → tile groups
    const zoneMap = new Map<number, Tile[]>();
    for (const t of this.tiles) {
      if (!zoneMap.has(t.zone)) zoneMap.set(t.zone, []);
      zoneMap.get(t.zone)!.push(t);
    }

    // ── 1. Primary column wave (left → right cascade, yoyo loops) ────────────
    for (let z = 0; z < ZONES; z++) {
      const group = zoneMap.get(z);
      if (!group?.length) continue;

      const zn = z / ZONES;
      const edgeness = Math.abs(zn - 0.5) * 2;          // 0 = centre, 1 = edge
      const peakGlow = 22 + (1 - edgeness) * 34;        // centre columns glow brighter
      const period = 1.15 + Math.random() * 1.35;
      const delay = z * 0.040;                           // wave travels ~2.15 s across canvas

      this.tweens.push(
        gsap.to(group, {
          colGlow: peakGlow,
          duration: period,
          delay,
          stagger: { each: 0.016, from: 'start' },
          ease: 'sine.inOut',
          yoyo: true,
          repeat: -1,
        })
      );
    }

    // ── 2. Secondary reverse wave (right → left, slower) ─────────────────────
    for (let z = ZONES - 1; z >= 0; z--) {
      const group = zoneMap.get(z);
      if (!group?.length) continue;

      const delay = (ZONES - 1 - z) * 0.052 + 2.0;

      this.tweens.push(
        gsap.to(group, {
          colGlow: 14,
          duration: 2.2,
          delay,
          stagger: { each: 0.022, from: 'end' },
          ease: 'power2.inOut',
          yoyo: true,
          repeat: -1,
        })
      );
    }

    // ── 3. Radial pulse (centre → edges, separate property – no conflict) ─────
    const byDist = [...this.tiles].sort((a, b) => {
      const dA = Math.sqrt((a.x / this.W - 0.5) ** 2 + (a.y / this.H - 0.5) ** 2);
      const dB = Math.sqrt((b.x / this.W - 0.5) ** 2 + (b.y / this.H - 0.5) ** 2);
      return dA - dB;
    });

    this.tweens.push(
      gsap.to(byDist, {
        radialGlow: 16,
        duration: 1.8,
        delay: 1.2,
        stagger: { each: 0.0012, from: 'start' },
        ease: 'sine.inOut',
        yoyo: true,
        repeat: -1,
      })
    );

    // ── 4. Hue drift for non-gold edge tiles (chromatic chaos on sides) ───────
    const edgeTiles = this.tiles.filter(t => !t.isCentral && t.baseHue > 120);
    if (edgeTiles.length) {
      this.tweens.push(
        gsap.to(edgeTiles, {
          hueShift: 75,
          duration: 8,
          stagger: { each: 0.009, from: 'random' },
          ease: 'sine.inOut',
          yoyo: true,
          repeat: -1,
        })
      );
    }

    // ── 5. Sparkle flashes (independent sparkGlow property) ──────────────────
    this.startSparkle();
  }

  private startSparkle() {
    const run = () => {
      if (!this.tiles.length) return;
      const count = 4 + Math.floor(Math.random() * 7);
      for (let i = 0; i < count; i++) {
        const t = this.tiles[Math.floor(Math.random() * this.tiles.length)];
        gsap.fromTo(
          t,
          { sparkGlow: 0 },
          {
            sparkGlow: 48 + Math.random() * 48,
            duration: 0.05 + Math.random() * 0.12,
            ease: 'power2.out',
            yoyo: true,
            repeat: 1 + Math.floor(Math.random() * 2),
          }
        );
      }
      gsap.delayedCall(0.04 + Math.random() * 0.16, run);
    };
    gsap.delayedCall(0.6, run);
  }

  // ─── Render loop ─────────────────────────────────────────────────────────────

  private draw() {
    const { ctx, W, H, tiles } = this;

    // Dark background with faint blue-black tint
    ctx.fillStyle = '#030309';
    ctx.fillRect(0, 0, W, H);

    for (const t of tiles) {
      const lit = Math.max(2, Math.min(100, t.baseLit + t.colGlow + t.radialGlow + t.sparkGlow));
      const sat = Math.min(100, t.baseSat);
      const hue = ((t.baseHue + t.hueShift) % 360 + 360) % 360;
      ctx.globalAlpha = Math.max(0.05, Math.min(1, t.baseAlpha));
      ctx.fillStyle = `hsl(${hue}, ${sat}%, ${lit}%)`;
      ctx.fillRect(t.x, t.y, t.w, t.h);
    }

    ctx.globalAlpha = 1;
  }
}
