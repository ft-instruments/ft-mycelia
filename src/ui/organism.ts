// The living background: a bioluminescent mycelium network. Nodes are
// joined to their nearest neighbours by slightly curved filaments; a note
// injects light at a node (position from pitch) and it travels along the
// filaments, dimming as it branches. Fireflies drift over the top and the
// audio level breathes through everything.

interface Node { x: number; y: number; energy: number; hue: number; links: number[]; phase: number }
interface Edge { a: number; b: number; bend: number; len: number }
interface Traveller { edge: number; t: number; dir: 1 | -1; strength: number; hue: number }
interface Firefly { x: number; y: number; vx: number; vy: number; phase: number; hue: number; size: number }

export class Organism {
  private ctx: CanvasRenderingContext2D;
  private nodes: Node[] = [];
  private edges: Edge[] = [];
  private travellers: Traveller[] = [];
  private fireflies: Firefly[] = [];
  private W = 0; private H = 0;
  private level = 0;          // smoothed audio level
  private levelTarget = 0;
  private last = 0;
  private running = true;
  private seed = 1;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    new ResizeObserver(() => this.resize()).observe(canvas);
    this.resize();
    document.addEventListener('visibilitychange', () => { this.running = !document.hidden; if (this.running) this.frame(performance.now()); });
    requestAnimationFrame((t) => this.frame(t));
  }

  private rnd(): number {
    let x = this.seed; x ^= x << 13; x ^= x >>> 17; x ^= x << 5; this.seed = x | 0;
    return (x >>> 0) / 4294967296;
  }

  private resize(): void {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const r = this.canvas.getBoundingClientRect();
    this.W = r.width; this.H = r.height;
    this.canvas.width = Math.round(r.width * dpr);
    this.canvas.height = Math.round(r.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.grow();
  }

  /** Lay the network out for the current size. */
  private grow(): void {
    this.seed = 7;
    const W = this.W, H = this.H;
    const count = Math.round(Math.max(40, Math.min(140, (W * H) / 14000)));
    const nodes: Node[] = [];
    // jittered grid so the density is even
    const cols = Math.ceil(Math.sqrt(count * W / Math.max(1, H)));
    const rows = Math.ceil(count / cols);
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      if (nodes.length >= count) break;
      nodes.push({
        x: ((i + 0.15 + this.rnd() * 0.7) / cols) * W,
        y: ((j + 0.15 + this.rnd() * 0.7) / rows) * H,
        energy: 0, hue: 160, links: [], phase: this.rnd() * 6.28,
      });
    }
    const edges: Edge[] = [];
    const key = (a: number, b: number) => (a < b ? a * 10000 + b : b * 10000 + a);
    const seen = new Set<number>();
    nodes.forEach((n, i) => {
      const near = nodes.map((m, k) => ({ k, d: Math.hypot(m.x - n.x, m.y - n.y) }))
        .filter((o) => o.k !== i).sort((p, q) => p.d - q.d).slice(0, 3);
      for (const o of near) {
        const kk = key(i, o.k);
        if (seen.has(kk)) continue;
        seen.add(kk);
        edges.push({ a: i, b: o.k, bend: (this.rnd() - 0.5) * 0.5, len: o.d });
        n.links.push(edges.length - 1); nodes[o.k].links.push(edges.length - 1);
      }
    });
    this.nodes = nodes; this.edges = edges; this.travellers = [];
    this.fireflies = [];
    for (let i = 0; i < Math.round(count / 3); i++) {
      this.fireflies.push({
        x: this.rnd() * W, y: this.rnd() * H, vx: (this.rnd() - 0.5) * 12, vy: (this.rnd() - 0.5) * 8,
        phase: this.rnd() * 6.28, hue: this.rnd() < 0.7 ? 150 + this.rnd() * 40 : 300 + this.rnd() * 20, size: 1 + this.rnd() * 1.6,
      });
    }
  }

  /** Light up the network from a note. */
  pulse(note: number, velocity: number): void {
    if (this.nodes.length === 0) return;
    const x = ((note - 36) / 60) * this.W;
    const hue = 150 + ((note - 36) / 60) * 160;    // green/teal low, magenta high
    // nearest node to that column, weighted towards the middle band vertically
    let best = 0, bestD = Infinity;
    const y = this.H * (0.3 + this.rnd() * 0.4);
    this.nodes.forEach((n, i) => { const d = Math.hypot(n.x - x, (n.y - y) * 0.6); if (d < bestD) { bestD = d; best = i; } });
    const n = this.nodes[best];
    const s = 0.5 + velocity / 127 * 0.6;
    n.energy = Math.min(1.4, n.energy + s);
    n.hue = hue;
    for (const e of n.links) {
      const edge = this.edges[e];
      this.travellers.push({ edge: e, t: 0, dir: edge.a === best ? 1 : -1, strength: s, hue });
    }
  }

  setLevel(peak: number): void { this.levelTarget = Math.min(1, peak * 1.4); }

  private frame(now: number): void {
    if (!this.running) return;
    const dt = Math.min(0.05, (now - this.last) / 1000 || 0.016);
    this.last = now;
    this.step(dt, now / 1000);
    this.draw(now / 1000);
    requestAnimationFrame((t) => this.frame(t));
  }

  private step(dt: number, time: number): void {
    this.level += (this.levelTarget - this.level) * (this.levelTarget > this.level ? 0.5 : 0.08);
    const W = this.W, H = this.H;
    for (const n of this.nodes) n.energy *= Math.pow(0.35, dt);
    const speed = 260;   // px/s along filaments
    for (let i = this.travellers.length - 1; i >= 0; i--) {
      const tr = this.travellers[i];
      const e = this.edges[tr.edge];
      tr.t += (speed * dt) / Math.max(20, e.len);
      if (tr.t >= 1) {
        this.travellers.splice(i, 1);
        const arrive = tr.dir === 1 ? e.b : e.a;
        const n = this.nodes[arrive];
        const s = tr.strength * 0.62;
        if (s > 0.12) {
          n.energy = Math.min(1.4, n.energy + s);
          n.hue = tr.hue;
          for (const k of n.links) {
            if (k === tr.edge) continue;
            const ne = this.edges[k];
            this.travellers.push({ edge: k, t: 0, dir: ne.a === arrive ? 1 : -1, strength: s, hue: tr.hue });
          }
        }
      }
    }
    if (this.travellers.length > 400) this.travellers.length = 400;
    for (const f of this.fireflies) {
      f.phase += dt * (0.8 + this.level);
      f.x += (f.vx + Math.sin(f.phase * 0.7) * 6) * dt * (1 + this.level * 2);
      f.y += (f.vy + Math.cos(f.phase * 0.5) * 4) * dt * (1 + this.level * 2);
      if (f.x < -10) f.x = W + 10; if (f.x > W + 10) f.x = -10;
      if (f.y < -10) f.y = H + 10; if (f.y > H + 10) f.y = -10;
    }
    void time;
  }

  private edgePoint(e: Edge, t: number): [number, number] {
    const a = this.nodes[e.a], b = this.nodes[e.b];
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    const dx = b.x - a.x, dy = b.y - a.y;
    const cx = mx - dy * e.bend, cy = my + dx * e.bend;
    const u = 1 - t;
    return [u * u * a.x + 2 * u * t * cx + t * t * b.x, u * u * a.y + 2 * u * t * cy + t * t * b.y];
  }

  private draw(time: number): void {
    const ctx = this.ctx, W = this.W, H = this.H;
    ctx.clearRect(0, 0, W, H);
    const breathe = 0.5 + 0.5 * Math.sin(time * 0.6);
    // filaments
    ctx.lineWidth = 1;
    for (const e of this.edges) {
      const a = this.nodes[e.a], b = this.nodes[e.b];
      const en = Math.max(a.energy, b.energy);
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      const dx = b.x - a.x, dy = b.y - a.y;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.quadraticCurveTo(mx - dy * e.bend, my + dx * e.bend, b.x, b.y);
      const alpha = 0.16 + breathe * 0.06 + this.level * 0.15 + en * 0.4;
      ctx.strokeStyle = en > 0.05 ? `hsla(${a.energy > b.energy ? a.hue : b.hue}, 90%, 65%, ${alpha})` : `rgba(90, 210, 150, ${alpha})`;
      ctx.stroke();
    }
    // travelling light
    for (const tr of this.travellers) {
      const [x, y] = this.edgePoint(this.edges[tr.edge], tr.t);
      const r = 2 + tr.strength * 3;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r * 4);
      g.addColorStop(0, `hsla(${tr.hue}, 100%, 75%, ${0.9 * tr.strength})`);
      g.addColorStop(1, `hsla(${tr.hue}, 100%, 60%, 0)`);
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, r * 4, 0, 6.283); ctx.fill();
    }
    // nodes
    for (const n of this.nodes) {
      const base = 0.45 + 0.25 * Math.sin(time * 1.3 + n.phase);
      const r = 1.2 + n.energy * 5;
      if (n.energy > 0.02) {
        const g = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, r * 6);
        g.addColorStop(0, `hsla(${n.hue}, 100%, 80%, ${Math.min(1, n.energy)})`);
        g.addColorStop(0.3, `hsla(${n.hue}, 100%, 60%, ${Math.min(1, n.energy) * 0.35})`);
        g.addColorStop(1, `hsla(${n.hue}, 100%, 60%, 0)`);
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(n.x, n.y, r * 6, 0, 6.283); ctx.fill();
      }
      ctx.fillStyle = `rgba(150, 255, 200, ${base + this.level * 0.3})`;
      ctx.beginPath(); ctx.arc(n.x, n.y, 1.8, 0, 6.283); ctx.fill();
    }
    // fireflies
    for (const f of this.fireflies) {
      const tw = 0.35 + 0.65 * Math.max(0, Math.sin(f.phase * 2.1));
      const a = tw * (0.35 + this.level * 0.5);
      const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.size * 6);
      g.addColorStop(0, `hsla(${f.hue}, 100%, 80%, ${a})`);
      g.addColorStop(1, `hsla(${f.hue}, 100%, 60%, 0)`);
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(f.x, f.y, f.size * 6, 0, 6.283); ctx.fill();
    }
  }
}

/** Small oscilloscope drawn as a glowing vine. */
export class Scope {
  private ctx: CanvasRenderingContext2D;
  private data: Float32Array = new Float32Array(1024);
  private peak = 0;
  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    new ResizeObserver(() => this.resize()).observe(canvas);
    this.resize();
  }
  private resize(): void {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const r = { width: this.canvas.clientWidth, height: this.canvas.clientHeight };   // layout size: the plugin scales the page
    this.canvas.width = Math.round(r.width * dpr); this.canvas.height = Math.round(r.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.draw();
  }
  update(data: Float32Array, peak: number): void { this.data = data; this.peak = peak; this.draw(); }
  draw(): void {
    const ctx = this.ctx;
    const W = this.canvas.clientWidth, H = this.canvas.clientHeight;
    ctx.clearRect(0, 0, W, H);
    const d = this.data, n = d.length;
    // find a rising zero crossing in the first half to stabilise the trace
    let start = 0;
    for (let i = 1; i < n / 2; i++) if (d[i - 1] < 0 && d[i] >= 0) { start = i; break; }
    const span = n / 2;
    ctx.lineWidth = 1.5;
    ctx.shadowColor = 'rgba(120,255,210,0.8)'; ctx.shadowBlur = 8 + this.peak * 12;
    ctx.strokeStyle = `rgba(150, 255, 215, ${0.45 + this.peak * 0.5})`;
    ctx.beginPath();
    for (let i = 0; i < span; i++) {
      const x = (i / span) * W;
      const y = H / 2 - d[(start + i) % n] * H * 0.48;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;
    // level bar
    ctx.fillStyle = this.peak > 0.95 ? 'rgba(255,90,120,0.9)' : 'rgba(150,255,215,0.6)';
    ctx.fillRect(0, H - 2, W * Math.min(1, this.peak), 2);
  }
}
