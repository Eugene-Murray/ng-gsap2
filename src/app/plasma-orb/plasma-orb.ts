import {
  Component,
  ElementRef,
  ViewChild,
  AfterViewInit,
  OnDestroy,
  NgZone,
} from '@angular/core';
import gsap from 'gsap';

// ─── Types ───────────────────────────────────────────────────────────────────

interface BeamRay {
  angle: number;      // exact angle in radians (0 = right, clockwise in canvas)
  length: number;     // base length in pixels
  width: number;      // stroke width
  hue: number;
  alpha: number;
  lenAnim: number;    // animated: added length
  alphaAnim: number;  // animated: added opacity
}

interface BeamCluster {
  rays: BeamRay[];
  baseAngle: number;
  flare: number;      // 0-1, animated
  driftAnim: number;  // slow angular drift, animated
}

interface Filament {
  x: number;          // position relative to orb centre
  y: number;
  angle: number;      // stroke direction
  length: number;
  hue: number;
  sat: number;
  lit: number;
  alpha: number;
  alphaAnim: number;  // animated
}

// ─── Component ───────────────────────────────────────────────────────────────

@Component({
  selector: 'app-plasma-orb',
  standalone: true,
  template: `<canvas #canvas></canvas>`,
  styles: [`
    :host {
      display: block;
      position: fixed;
      inset: 0;
      background: #000;
    }
    canvas { display: block; }
  `],
})
export class PlasmaOrbComponent implements AfterViewInit, OnDestroy {
  @ViewChild('canvas') canvasRef!: ElementRef<HTMLCanvasElement>;

  private ctx!: CanvasRenderingContext2D;
  private W = 0;
  private H = 0;
  private R = 0;

  private clusters: BeamCluster[] = [];
  private filaments: Filament[] = [];
  private tweens: (gsap.core.Tween | gsap.core.Timeline)[] = [];
  private tickerFn!: () => void;
  private orb = { scale: 1.0, glow: 0 };

  constructor(private ngZone: NgZone) {}

  ngAfterViewInit() {
    this.ngZone.runOutsideAngular(() => {
      const canvas = this.canvasRef.nativeElement;
      this.W = window.innerWidth;
      this.H = window.innerHeight;
      canvas.width = this.W;
      canvas.height = this.H;
      this.ctx = canvas.getContext('2d')!;
      this.R = Math.min(this.W, this.H) * 0.27;
      this.buildClusters();
      this.buildFilaments();
      this.startAnimations();
      this.tickerFn = () => this.draw();
      gsap.ticker.add(this.tickerFn);
      gsap.ticker.fps(60);
    });
  }

  ngOnDestroy() {
    gsap.ticker.remove(this.tickerFn);
    this.tweens.forEach(t => t.kill());
    gsap.killTweensOf(this.filaments);
    gsap.killTweensOf(this.clusters);
    gsap.killTweensOf(this.orb);
  }

  // ─── Scene builders ───────────────────────────────────────────────────────

  private buildClusters() {
    const D = Math.sqrt(this.W ** 2 + this.H ** 2);

    // baseAngle (radians), hue, hueRange, numRays, spread, min/maxLen fraction of D
    // Angles: 0=right, PI/2=down, PI=left, -PI/2=up
    const clusterDefs = [
      // Upper-left  — magenta / pink / white
      { baseAngle: -2.35,  hue: 308, hueRange: 40, numRays: 8,  spread: 0.28, minLen: 0.28, maxLen: 0.60 },
      // Lower-left  — orange / gold
      { baseAngle:  2.55,  hue:  38, hueRange: 28, numRays: 9,  spread: 0.34, minLen: 0.30, maxLen: 0.65 },
      // Right        — yellow-green / lime
      { baseAngle:  0.05,  hue:  75, hueRange: 32, numRays: 8,  spread: 0.28, minLen: 0.26, maxLen: 0.55 },
      // Right-lower  — gold / amber
      { baseAngle:  0.42,  hue:  48, hueRange: 20, numRays: 5,  spread: 0.20, minLen: 0.20, maxLen: 0.44 },
    ];

    for (const def of clusterDefs) {
      const rays: BeamRay[] = [];
      const mid = Math.floor(def.numRays / 2);

      for (let i = 0; i < def.numRays; i++) {
        const t = def.numRays > 1 ? i / (def.numRays - 1) : 0.5;  // 0..1
        const isMid = i === mid;

        rays.push({
          angle:     def.baseAngle + (t - 0.5) * def.spread,
          length:    (def.minLen + Math.random() * (def.maxLen - def.minLen)) * D,
          width:     isMid ? 5 + Math.random() * 4 : 1.5 + Math.random() * 2.5,
          hue:       def.hue + (t - 0.5) * def.hueRange + (Math.random() - 0.5) * 8,
          alpha:     0.50 + Math.random() * 0.45,
          lenAnim:   0,
          alphaAnim: 0,
        });
      }

      this.clusters.push({ rays, baseAngle: def.baseAngle, flare: 0, driftAnim: 0 });
    }
  }

  private buildFilaments() {
    const count = 1600;
    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2;
      const rFrac  = Math.sqrt(Math.random());          // sqrt → denser near edge
      const r      = rFrac * this.R * 0.96;
      // Loosely tangential stroke direction
      const tangent = theta + Math.PI / 2 + (Math.random() - 0.5) * 1.4;

      this.filaments.push({
        x:         r * Math.cos(theta),
        y:         r * Math.sin(theta),
        angle:     tangent,
        length:    5 + Math.random() * 22,
        hue:       340 + (Math.random() - 0.5) * 50,   // warm pinks / reds
        sat:       45 + Math.random() * 45,
        lit:       32 + Math.random() * 36,
        alpha:     0.05 + Math.random() * 0.14,
        alphaAnim: 0,
      });
    }
  }

  // ─── GSAP animations ──────────────────────────────────────────────────────

  private startAnimations() {
    // Orb breathe
    this.tweens.push(
      gsap.to(this.orb, {
        scale: 1.034,
        glow:  1,
        duration: 3.2,
        ease: 'sine.inOut',
        yoyo: true,
        repeat: -1,
      })
    );

    // Per-cluster animations
    for (const cluster of this.clusters) {
      // Slow angular drift
      this.tweens.push(
        gsap.to(cluster, {
          driftAnim: (Math.random() - 0.5) * 0.09,
          duration:  5 + Math.random() * 5,
          ease: 'sine.inOut',
          yoyo: true,
          repeat: -1,
          delay: Math.random() * 3,
        })
      );

      // Flare pulse
      this.tweens.push(
        gsap.to(cluster, {
          flare: 0.75 + Math.random() * 0.25,
          duration: 0.7 + Math.random() * 1.1,
          ease: 'power2.inOut',
          yoyo: true,
          repeat: -1,
          delay: Math.random() * 2,
        })
      );

      // Per-ray length / alpha flicker
      for (const ray of cluster.rays) {
        this.tweens.push(
          gsap.to(ray, {
            lenAnim:  ray.length * (0.08 + Math.random() * 0.22),
            duration: 1.4 + Math.random() * 2.8,
            ease: 'sine.inOut',
            yoyo: true,
            repeat: -1,
            delay: Math.random() * 2,
          })
        );
        this.tweens.push(
          gsap.to(ray, {
            alphaAnim: 0.3 + Math.random() * 0.2,
            duration:  0.5 + Math.random() * 1.6,
            ease: 'sine.inOut',
            yoyo: true,
            repeat: -1,
            delay: Math.random() * 1.5,
          })
        );
      }
    }

    // Filament shimmer — batched with stagger for performance
    const batchSize = 80;
    for (let i = 0; i < this.filaments.length; i += batchSize) {
      const batch = this.filaments.slice(i, i + batchSize);
      this.tweens.push(
        gsap.to(batch, {
          alphaAnim: 0.14,
          duration:  0.25 + Math.random() * 1.3,
          ease: 'sine.inOut',
          stagger: { each: 0.012, from: 'random' },
          yoyo: true,
          repeat: -1,
          delay: Math.random() * 1.8,
        })
      );
    }
  }

  // ─── Render loop ──────────────────────────────────────────────────────────

  private draw() {
    const { ctx, W, H } = this;
    const cx = W / 2;
    const cy = H / 2;
    const r  = this.R * this.orb.scale;

    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);

    // ── 1. Beams — drawn behind sphere ────────────────────────────────────────
    ctx.save();
    ctx.translate(cx, cy);
    ctx.globalCompositeOperation = 'screen';
    for (const cluster of this.clusters) {
      for (const ray of cluster.rays) {
        this.drawRay(ray, cluster.driftAnim, r);
      }
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();

    // ── 2. Sphere ─────────────────────────────────────────────────────────────
    this.drawSphere(cx, cy, r);

    // ── 3. Filaments — clipped to sphere, screen blend ────────────────────────
    ctx.save();
    ctx.translate(cx, cy);
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.clip();
    ctx.globalCompositeOperation = 'screen';

    for (const f of this.filaments) {
      const a = Math.min(1, f.alpha + f.alphaAnim);
      if (a < 0.02) continue;
      ctx.globalAlpha = a;
      ctx.strokeStyle  = `hsl(${f.hue},${f.sat}%,${f.lit}%)`;
      ctx.lineWidth    = 0.65;
      ctx.beginPath();
      ctx.moveTo(f.x, f.y);
      ctx.lineTo(f.x + f.length * Math.cos(f.angle), f.y + f.length * Math.sin(f.angle));
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.restore();

    // ── 4. Discharge flares — over sphere ─────────────────────────────────────
    ctx.save();
    ctx.translate(cx, cy);
    ctx.globalCompositeOperation = 'screen';
    for (const cluster of this.clusters) {
      this.drawFlare(cluster, r);
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();
  }

  // ─── Drawing helpers ──────────────────────────────────────────────────────

  private drawSphere(cx: number, cy: number, r: number) {
    const { ctx } = this;
    const g  = this.orb.glow;

    // Far atmospheric halo
    let grad = ctx.createRadialGradient(cx, cy, r * 0.65, cx, cy, r * 2.9);
    grad.addColorStop(0,   `hsla(350, 68%, 22%, ${0.22 + g * 0.08})`);
    grad.addColorStop(0.45,`hsla(350, 58%, 12%, ${0.10 + g * 0.04})`);
    grad.addColorStop(1,   'hsla(0,0%,0%,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 2.9, 0, Math.PI * 2);
    ctx.fill();

    // Main sphere body — offset highlight gives illusion of lit volume
    const hx = cx - r * 0.22;
    const hy = cy - r * 0.18;
    grad = ctx.createRadialGradient(hx, hy, r * 0.04, cx, cy, r);
    grad.addColorStop(0.00, `hsl(18,  80%, 66%)`);   // warm highlight
    grad.addColorStop(0.18, `hsl(4,   84%, 50%)`);   // vivid red
    grad.addColorStop(0.50, `hsl(348, 76%, 32%)`);   // deep red
    grad.addColorStop(0.85, `hsl(340, 65%, 18%)`);   // dark rim
    grad.addColorStop(1.00, `hsl(340, 52%, 10%)`);   // near-black edge
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();

    // Breathing inner glow
    if (g > 0.02) {
      grad = ctx.createRadialGradient(hx, hy, 0, cx, cy, r * 0.68);
      grad.addColorStop(0,   `hsla(28, 88%, 72%, ${g * 0.26})`);
      grad.addColorStop(0.5, `hsla(10, 76%, 55%, ${g * 0.10})`);
      grad.addColorStop(1,   'hsla(0,0%,0%,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.68, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawRay(ray: BeamRay, driftOffset: number, r: number) {
    const { ctx } = this;
    const angle  = ray.angle + driftOffset;
    const len    = ray.length + ray.lenAnim;
    const alpha  = Math.min(1, ray.alpha + ray.alphaAnim);
    const ox     = Math.cos(angle) * r * 0.88;
    const oy     = Math.sin(angle) * r * 0.88;
    const ex     = Math.cos(angle) * len;
    const ey     = Math.sin(angle) * len;

    const grad = ctx.createLinearGradient(ox, oy, ex, ey);
    grad.addColorStop(0.00, `hsla(${ray.hue}, 96%, 85%, ${alpha})`);
    grad.addColorStop(0.07, `hsla(${ray.hue}, 92%, 74%, ${alpha * 0.88})`);
    grad.addColorStop(0.28, `hsla(${ray.hue}, 86%, 58%, ${alpha * 0.44})`);
    grad.addColorStop(0.62, `hsla(${ray.hue}, 78%, 46%, ${alpha * 0.14})`);
    grad.addColorStop(1.00, `hsla(${ray.hue}, 70%, 40%, 0)`);

    ctx.strokeStyle = grad;
    ctx.lineWidth   = ray.width;
    ctx.lineCap     = 'round';
    ctx.beginPath();
    ctx.moveTo(ox, oy);
    ctx.lineTo(ex, ey);
    ctx.stroke();
  }

  private drawFlare(cluster: BeamCluster, r: number) {
    const { ctx } = this;
    const angle  = cluster.baseAngle + cluster.driftAnim;
    const fx     = Math.cos(angle) * r * 0.91;
    const fy     = Math.sin(angle) * r * 0.91;
    const f      = cluster.flare;
    const flareR = r * (0.055 + f * 0.115);
    const hue    = cluster.rays[Math.floor(cluster.rays.length / 2)].hue;

    const grad = ctx.createRadialGradient(fx, fy, 0, fx, fy, flareR * 3.8);
    grad.addColorStop(0.00, `hsla(${hue + 30}, 100%, 96%, ${0.92 * f})`);
    grad.addColorStop(0.12, `hsla(${hue + 15}, 100%, 86%, ${0.62 * f})`);
    grad.addColorStop(0.42, `hsla(${hue},       90%, 70%, ${0.28 * f})`);
    grad.addColorStop(1.00, `hsla(${hue},       82%, 55%, 0)`);

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(fx, fy, flareR * 3.8, 0, Math.PI * 2);
    ctx.fill();
  }
}
