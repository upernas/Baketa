import { h, segmented } from './dom';

export interface VizLayer {
  key: string;
  label: string;
  color: string;
  /** Posiciones de los golpes como fracción del ciclo (0..1), ordenadas */
  positions: number[];
  /** Intensidad de cada posición: 0 = hueco (se dibuja tenue), 1..3 */
  levels?: number[];
  /** Marcas de referencia en el anillo (pulsos) */
  ticks?: number;
  muted?: boolean;
}

export type VizMode = 'circle' | 'lines';

const NS = 'http://www.w3.org/2000/svg';
const TAU = Math.PI * 2;

function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>): SVGElementTagNameMap[K] {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

const polar = (r: number, frac: number): [number, number] => {
  const a = frac * TAU - Math.PI / 2;
  return [r * Math.cos(a), r * Math.sin(a)];
};

const DOT_R = [2.2, 3.4, 4.6, 5.8];

interface Built {
  /** Posiciones activas (vértices del polígono) y su punto */
  active: { frac: number; x: number; y: number }[];
  radius: number;
  mover: SVGCircleElement;
  row: number;
}

/**
 * Representación geométrica del ritmo: cada capa es un polígono inscrito cuyos
 * vértices son los golpes. Un punto recorre el perímetro y llega a cada vértice
 * justo cuando suena, así se ve cómo encajan capas con distinto número de golpes.
 */
export class Visualizer {
  readonly el: HTMLElement;
  private svgEl: SVGSVGElement;
  private legend: HTMLElement;
  private center: SVGTextElement | null = null;
  private hand: SVGLineElement | null = null;
  private layers: VizLayer[] = [];
  private built = new Map<string, Built>();
  private vertices = new Map<string, SVGElement[]>();
  private lastFrac = -1;

  constructor(
    private mode: VizMode = 'circle',
    private readonly onMode?: (m: VizMode) => void,
  ) {
    this.svgEl = svg('svg', { class: 'viz-svg', role: 'img', 'aria-label': 'Visualización del ritmo' });
    this.legend = h('div', { class: 'viz-legend' });
    const modes = h('div', { class: 'viz-modes' });
    const renderModes = () =>
      modes.replaceChildren(
        segmented<VizMode>(
          [
            { value: 'circle', label: 'Círculo' },
            { value: 'lines', label: 'Líneas' },
          ],
          this.mode,
          (m) => {
            this.mode = m;
            renderModes();
            this.render();
            this.onMode?.(m);
          },
          'small',
          'Tipo de vista',
        ),
      );
    renderModes();
    this.el = h('div', { class: 'viz' }, modes, h('div', { class: `viz-stage` }, this.svgEl), this.legend);
  }

  get visible(): boolean {
    return this.el.isConnected && this.el.offsetParent !== null;
  }

  setLayers(layers: VizLayer[]): void {
    this.layers = layers;
    this.render();
  }

  private render(): void {
    this.built.clear();
    this.vertices.clear();
    this.lastFrac = -1;
    this.svgEl.replaceChildren();
    this.el.classList.toggle('lines', this.mode === 'lines');
    if (this.mode === 'circle') this.renderCircle();
    else this.renderLines();
    this.legend.replaceChildren(
      ...this.layers.map((l) =>
        h(
          'span',
          { class: `viz-key${l.muted ? ' muted' : ''}`, style: `--c:${l.color}` },
          h('i', { 'aria-hidden': 'true' }),
          l.label,
        ),
      ),
    );
    this.frame(null);
  }

  private renderCircle(): void {
    const n = this.layers.length;
    this.svgEl.setAttribute('viewBox', '-120 -120 240 240');
    const outer = 104;
    const gap = n > 1 ? Math.min(26, 72 / (n - 1)) : 0;

    const guide = svg('g', { class: 'viz-guides' });
    const shapes = svg('g', {});
    const movers = svg('g', {});
    this.svgEl.append(guide, shapes, movers);

    this.layers.forEach((layer, li) => {
      const r = outer - li * gap;
      const g = svg('g', { class: `viz-layer${layer.muted ? ' muted' : ''}`, style: `--c:${layer.color}` });
      guide.append(svg('circle', { class: 'viz-ring', r, cx: 0, cy: 0 }));
      for (let t = 0; t < (layer.ticks ?? 0); t++) {
        const [x1, y1] = polar(r - 4, t / layer.ticks!);
        const [x2, y2] = polar(r + 4, t / layer.ticks!);
        guide.append(svg('line', { class: 'viz-tick', x1, y1, x2, y2 }));
      }

      const active: Built['active'] = [];
      layer.positions.forEach((f, i) => {
        if ((layer.levels?.[i] ?? 2) > 0) {
          const [x, y] = polar(r, f);
          active.push({ frac: f, x, y });
        }
      });
      if (active.length >= 2) {
        const d = active.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ') + (active.length > 2 ? 'Z' : '');
        g.append(svg('path', { class: 'viz-poly', d }));
      }

      const verts: SVGElement[] = [];
      layer.positions.forEach((f, i) => {
        const lv = layer.levels?.[i] ?? 2;
        const [x, y] = polar(r, f);
        const dot = svg('circle', { class: `viz-dot l${lv}`, cx: x.toFixed(2), cy: y.toFixed(2), r: DOT_R[lv] });
        verts.push(dot);
        g.append(dot);
      });
      this.vertices.set(layer.key, verts);
      shapes.append(g);

      const mover = svg('circle', { class: 'viz-mover', r: 4, style: `--c:${layer.color}` });
      movers.append(mover);
      this.built.set(layer.key, { active, radius: r, mover, row: li });
    });

    this.hand = svg('line', { class: 'viz-hand', x1: 0, y1: 0, x2: 0, y2: -112 });
    this.center = svg('text', { class: 'viz-count', x: 0, y: 0, 'text-anchor': 'middle', 'dominant-baseline': 'central' });
    this.svgEl.prepend(this.hand);
    this.svgEl.append(this.center);
  }

  private renderLines(): void {
    const n = Math.max(1, this.layers.length);
    const rowH = 40;
    const labelW = 0;
    const W = 400;
    const H = n * rowH + 10;
    this.svgEl.setAttribute('viewBox', `-8 -6 ${W + 16 + labelW} ${H}`);
    const grid = svg('g', { class: 'viz-guides' });
    this.svgEl.append(grid);

    const ticks = this.layers[0]?.ticks ?? 0;
    for (let t = 0; t <= ticks; t++) {
      grid.append(svg('line', { class: 'viz-tick', x1: (t / Math.max(1, ticks)) * W, y1: 0, x2: (t / Math.max(1, ticks)) * W, y2: n * rowH - 6 }));
    }

    this.layers.forEach((layer, li) => {
      const y = li * rowH + rowH / 2 - 3;
      const g = svg('g', { class: `viz-layer${layer.muted ? ' muted' : ''}`, style: `--c:${layer.color}` });
      g.append(svg('line', { class: 'viz-track', x1: 0, y1: y, x2: W, y2: y }));
      const verts: SVGElement[] = [];
      const active: Built['active'] = [];
      layer.positions.forEach((f, i) => {
        const lv = layer.levels?.[i] ?? 2;
        const x = f * W;
        const bar = svg('rect', {
          class: `viz-dot l${lv}`,
          x: x - 3.5, y: y - (lv ? 5 + lv * 3.5 : 3), width: 7, height: lv ? 2 * (5 + lv * 3.5) : 6, rx: 2,
        });
        verts.push(bar);
        g.append(bar);
        if (lv > 0) active.push({ frac: f, x, y });
      });
      this.vertices.set(layer.key, verts);
      this.svgEl.append(g);
      this.built.set(layer.key, { active, radius: 0, mover: svg('circle', { r: 0 }), row: li });
    });

    this.hand = svg('line', { class: 'viz-hand', x1: 0, y1: -4, x2: 0, y2: n * rowH - 2 });
    this.svgEl.append(this.hand);
    this.center = null;
  }

  /** Ilumina un golpe al sonar. */
  hit(key: string, index: number): void {
    const el = this.vertices.get(key)?.[index];
    if (!el) return;
    el.classList.remove('hit');
    // Reinicia la animación
    void (el as SVGGraphicsElement).getBBox?.();
    el.classList.add('hit');
  }

  /** Actualiza la posición: frac = fracción del ciclo (null = parado). */
  frame(frac: number | null, count = ''): void {
    const f = frac ?? 0;
    if (this.center) this.center.textContent = count;
    if (Math.abs(f - this.lastFrac) < 1e-4) return;
    this.lastFrac = f;
    this.el.classList.toggle('idle', frac === null);

    if (this.mode === 'lines') {
      const x = (f * 400).toFixed(2);
      this.hand?.setAttribute('x1', x);
      this.hand?.setAttribute('x2', x);
      return;
    }

    const [hx, hy] = polar(112, f);
    this.hand?.setAttribute('x2', hx.toFixed(2));
    this.hand?.setAttribute('y2', hy.toFixed(2));

    for (const b of this.built.values()) {
      let x: number;
      let y: number;
      const a = b.active;
      if (a.length < 2) {
        [x, y] = polar(b.radius, f);
      } else {
        // Recorre el perímetro del polígono: de un golpe al siguiente en el tiempo que los separa
        let j = a.length - 1;
        for (let i = 0; i < a.length; i++) {
          if (a[i].frac <= f + 1e-9) j = i;
          else break;
        }
        const p0 = a[j];
        const p1 = a[(j + 1) % a.length];
        const start = p0.frac > f + 1e-9 ? p0.frac - 1 : p0.frac;
        let end = p1.frac;
        if (end <= start + 1e-9) end += 1;
        const t = Math.min(1, Math.max(0, (f - start) / (end - start)));
        x = p0.x + (p1.x - p0.x) * t;
        y = p0.y + (p1.y - p0.y) * t;
      }
      b.mover.setAttribute('cx', x.toFixed(2));
      b.mover.setAttribute('cy', y.toFixed(2));
    }
  }
}
