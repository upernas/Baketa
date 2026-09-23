import { AudioEngine } from '../audio/engine';
import { createTimer } from '../audio/timer';
import { Transport, type ScheduledEvent, type TransportSource } from '../audio/transport';
import { beatStepOptions, clampBpm, isCompound, pulsesPerBar, sameMeter, subdivisionOptions } from '../core/meter';
import {
  clonePattern, defaultMetSteps, groupingSteps, metPreset, nextMetLevel, remapMetSteps, resizePattern, uid,
  type MetPresetId,
} from '../core/patterns';
import { isPracticeActive, planBar, timerLimit, type BarPlan, type EndReason } from '../core/practice';
import { Store } from '../core/store';
import { TapTempo } from '../core/tapTempo';
import type {
  AppState, BeatPattern, Groove, InstrumentId, Level, Meter, MetStep, PlayMode, PolyLayer, Tab,
} from '../core/types';
import { BUILTIN_GROOVES } from '../data/grooves';

const MET_GAIN = [0, 0.42, 0.72, 1];
const BEAT_GAIN = [0, 0.3, 0.74, 1];

export type TransportState = 'stopped' | 'playing' | 'paused';

export interface BeatSource {
  meter: Meter;
  pattern: BeatPattern;
}

export interface PlayContext {
  mode: PlayMode;
  preview: Groove | null;
}

/** Posición continua para animaciones: pulso absoluto con decimales. */
export interface Phase {
  pulse: number;
  bar: number;
  pulses: number;
  elapsed: number;
}

export const POLY_COLORS = ['#6fc7b4', '#e98a6c', '#a99bf0', '#8fb8e8', '#e3c56a', '#d98cc0'];

type WakeLockNavigator = Navigator & {
  wakeLock?: { request(type: 'screen'): Promise<{ release(): Promise<void> }> };
};

export class Controller {
  readonly audio = new AudioEngine();
  readonly transport: Transport;
  readonly tapper = new TapTempo();

  state: TransportState = 'stopped';
  /** Groove de la biblioteca que se está escuchando (null = el del beat maker) */
  preview: Groove | null = null;
  /** Posición actual para la interfaz */
  current = { bar: 0, pulse: 0, metStep: -1, beatStep: -1, block: -1, mode: 'full' as string };
  /** Inicio de la rampa en esta sesión */
  rampBase = 100;
  lastEnd: EndReason | null = null;
  seed = 1;

  private tickFns = new Set<(e: ScheduledEvent) => void>();
  private transportFns = new Set<() => void>();
  private visualQueue: ScheduledEvent[] = [];
  private rampApplied = 0;
  private lastPulse: ScheduledEvent | null = null;
  private frameFns = new Set<(phase: Phase | null) => void>();
  private metCache: { key: string; steps: MetStep[] } = { key: '', steps: [] };
  private wakeLock: { release(): Promise<void> } | null = null;
  private undoStack: { editor: AppState['editor'] }[] = [];

  constructor(readonly store: Store) {
    const source: TransportSource = {
      bpm: () => this.s.bpm,
      pulses: () => pulsesPerBar(this.activeMeter()),
      metSub: () => this.metSub(),
      subAllowed: (sub) => subdivisionOptions(this.activeMeter()).includes(sub),
      beatSpb: () => this.beat().pattern.stepsPerBeat,
      beatBars: () => this.beat().pattern.bars,
      swing: () => {
        const m = this.activeMeter();
        const sw = this.transport.mode === 'beat' ? this.beat().pattern.swing : this.s.metronome.swing;
        return { amount: sw.amount, unit: sw.unit, compound: isCompound(m) };
      },
      clickWithBeat: () => this.s.beatClick,
      loop: () => this.s.loop || isPracticeActive(this.s.practice),
      planBar: (bar, elapsed) => this.planBar(bar, elapsed),
      limit: () => timerLimit(this.s.practice.timer),
      poly: () => (this.s.metronome.poly.on ? this.s.metronome.poly.layers.map((l) => l.n) : []),
      polyBars: () => this.s.metronome.poly.cycleBars,
      playMet: (e) => this.playMet(e),
      playBeat: (e) => this.playBeat(e),
      playPoly: (e) => this.playPoly(e),
    };

    this.transport = new Transport({ now: () => this.audio.now() }, createTimer(), source, {
      onEvent: (e) => this.visualQueue.push(e),
      onTempo: (bpm) => {
        this.rampApplied = bpm;
        if (bpm !== this.s.bpm) this.store.update('bpm', (s) => (s.bpm = bpm), false);
      },
      onEnd: (reason) => {
        this.lastEnd = reason;
        this.setState('stopped');
      },
    });

    this.applyVolumes();
    store.subscribe((keys) => {
      if (keys.has('volumes') || keys.has('mixer') || keys.has('all')) this.applyVolumes();
    });

    document.addEventListener('visibilitychange', () => {
      // En segundo plano los temporizadores se ralentizan: se amplía la ventana de programación.
      this.transport.lookahead = document.hidden ? 1.2 : 0.12;
      if (!document.hidden && this.state === 'playing') void this.requestWakeLock();
    });

    const frame = () => {
      this.drainVisuals();
      if (this.frameFns.size) {
        const ph = this.phase();
        for (const fn of this.frameFns) fn(ph);
      }
      // Respaldo por si el temporizador del Worker se detiene
      if (this.state === 'playing') this.transport.tick();
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  get s(): AppState {
    return this.store.state;
  }

  get mode(): PlayMode {
    return this.transport.mode;
  }

  onTick(fn: (e: ScheduledEvent) => void): () => void {
    this.tickFns.add(fn);
    return () => this.tickFns.delete(fn);
  }

  /** Llamada en cada fotograma con la posición continua (null si está parado). */
  onFrame(fn: (phase: Phase | null) => void): () => void {
    this.frameFns.add(fn);
    return () => this.frameFns.delete(fn);
  }

  visualNow(): number {
    return this.audio.now() - this.audio.outputLatency() - this.s.settings.visualOffsetMs / 1000;
  }

  phase(): Phase | null {
    const e = this.lastPulse;
    if (!e || this.state === 'stopped') return null;
    const frac = this.state === 'playing' ? Math.min(0.999, Math.max(0, (this.visualNow() - e.time) / e.dur)) : 0;
    return { pulse: e.step + frac, bar: e.bar, pulses: e.pulses, elapsed: e.elapsed + frac * e.dur };
  }

  /** Segundos transcurridos en la sesión actual. */
  elapsedNow(): number {
    return this.phase()?.elapsed ?? 0;
  }

  onTransport(fn: () => void): () => void {
    this.transportFns.add(fn);
    return () => this.transportFns.delete(fn);
  }

  /* ---------- fuentes de reproducción ---------- */

  beat(): BeatSource {
    return this.preview ?? { meter: this.s.editor.meter, pattern: this.s.editor.pattern };
  }

  activeMeter(): Meter {
    return this.transport.mode === 'beat' ? this.beat().meter : this.s.meter;
  }

  private metSub(): number {
    const sub = this.s.metronome.subdivision;
    return subdivisionOptions(this.activeMeter()).includes(sub) ? sub : 1;
  }

  /** Patrón del click: el del usuario si encaja con el compás activo, o uno estándar si no. */
  private metSteps(pulses: number, sub: number): MetStep[] {
    const m = this.s.metronome;
    if (m.steps.length === pulses * sub && sameMeter(this.activeMeter(), this.s.meter)) return m.steps;
    const key = `${pulses}:${sub}`;
    if (this.metCache.key !== key) this.metCache = { key, steps: defaultMetSteps(pulses, sub) };
    return this.metCache.steps;
  }

  private planBar(bar: number, elapsed: number): BarPlan {
    const plan = planBar(this.s.practice, this.rampBase, bar, elapsed, this.seed);
    if (plan.bpm !== null) this.rampApplied = plan.bpm;
    return plan;
  }

  private playPoly(e: ScheduledEvent): void {
    if (e.mode === 'silent') return;
    const layer = this.s.metronome.poly.layers[e.layer];
    if (!layer || layer.mute) return;
    const gain = (e.step === 0 && layer.accent ? 1 : 0.68) * layer.vol;
    this.audio.play(layer.sound, e.time, gain, 'met');
  }

  private playMet(e: ScheduledEvent): void {
    if (e.mode === 'silent') return;
    const s = e.step % e.sub;
    if (e.mode === 'beats' && s !== 0) return;
    if (e.mode === 'downbeat' && e.step !== 0) return;
    const st = this.metSteps(e.pulses, e.sub)[e.step];
    if (!st || st.level === 0) return;
    const snd = this.s.metronome.sounds;
    const sound = st.sound ?? (st.level === 3 ? snd.accent : st.level === 2 ? snd.beat : snd.sub);
    this.audio.play(sound, e.time, MET_GAIN[st.level], 'met');
  }

  private playBeat(e: ScheduledEvent): void {
    if (e.mode === 'silent') return;
    const { pattern } = this.beat();
    for (const [id, track] of Object.entries(pattern.tracks)) {
      const lv = track[e.step];
      if (lv) this.audio.play(id, e.time, BEAT_GAIN[lv], 'beat');
    }
  }

  private drainVisuals(): void {
    if (!this.visualQueue.length || !this.audio.ctx) return;
    const now = this.audio.now() - this.audio.outputLatency() - this.s.settings.visualOffsetMs / 1000;
    let i = 0;
    while (i < this.visualQueue.length && this.visualQueue[i].time <= now) {
      const e = this.visualQueue[i++];
      this.current.bar = e.bar;
      this.current.pulse = e.pulse;
      this.current.block = e.block;
      if (e.kind === 'pulse') {
        this.lastPulse = e;
        this.current.mode = e.mode;
      } else if (e.kind === 'met') this.current.metStep = e.step;
      else if (e.kind === 'beat') this.current.beatStep = e.step;
      for (const fn of this.tickFns) fn(e);
    }
    if (i) this.visualQueue.splice(0, i);
  }

  /* ---------- transporte ---------- */

  private setState(st: TransportState): void {
    this.state = st;
    if (st !== 'playing') {
      this.visualQueue = [];
      if (st === 'stopped') {
        this.current = { bar: 0, pulse: 0, metStep: -1, beatStep: -1, block: -1, mode: 'full' };
        this.lastPulse = null;
      }
      void this.releaseWakeLock();
    } else {
      void this.requestWakeLock();
    }
    for (const fn of this.transportFns) fn();
  }

  /** Qué debe sonar al pulsar play en cada sección. */
  contextFor(tab: Tab): PlayContext {
    switch (tab) {
      case 'metronome':
        return { mode: 'metronome', preview: null };
      case 'beat':
        return { mode: 'beat', preview: null };
      case 'practice':
        return { mode: this.s.practice.source, preview: null };
      case 'grooves':
        if (this.preview) return { mode: 'beat', preview: this.preview };
        return { mode: this.transport.mode, preview: null };
      default:
        return { mode: this.transport.mode, preview: this.transport.mode === 'beat' ? this.preview : null };
    }
  }

  /** ¿Lo que suena (o está en pausa) es lo que corresponde a esta sección? */
  isContext(tab: Tab): boolean {
    const want = this.contextFor(tab);
    return want.mode === this.transport.mode && (want.preview?.id ?? null) === (this.preview?.id ?? null);
  }

  async play(mode: PlayMode, preview: Groove | null = null, resume = false): Promise<void> {
    await this.audio.init();
    await this.audio.resume();
    const canResume = resume && this.state === 'paused' && mode === this.transport.mode && preview?.id === this.preview?.id;
    this.preview = preview;
    this.audio.cancelScheduled();
    const from = canResume ? this.transport.position : { pulse: 0, elapsed: 0 };
    this.lastEnd = null;
    if (from.pulse === 0) {
      const ramp = this.s.practice.ramp;
      this.rampBase = ramp.on && ramp.from > 0 ? ramp.from : this.s.bpm;
      this.rampApplied = this.rampBase;
      this.seed = (Math.random() * 0x7fffffff) | 0;
    }
    this.transport.start(mode, from);
    this.setState('playing');
  }

  pause(): void {
    if (this.state !== 'playing') return;
    this.transport.pause();
    this.audio.cancelScheduled();
    this.setState('paused');
  }

  stop(): void {
    this.transport.stop();
    this.audio.cancelScheduled();
    this.setState('stopped');
  }

  /**
   * Play/pausa según la sección visible. Si lo que suena es de otra sección,
   * el botón cambia a lo que corresponde a la sección actual.
   */
  toggle(tab: Tab = this.s.tab): void {
    const want = this.contextFor(tab);
    const same = this.isContext(tab);
    if (this.state === 'playing' && same) this.pause();
    else if (this.state === 'paused' && same) void this.play(want.mode, want.preview, true);
    else void this.play(want.mode, want.preview);
  }

  togglePreview(g: Groove): void {
    if (this.state === 'playing' && this.preview?.id === g.id) {
      this.stop();
      return;
    }
    this.setBpm(g.bpm);
    void this.play('beat', g);
  }

  private async requestWakeLock(): Promise<void> {
    const nav = navigator as WakeLockNavigator;
    if (!this.s.settings.wakeLock || !nav.wakeLock || this.wakeLock) return;
    try {
      this.wakeLock = await nav.wakeLock.request('screen');
    } catch {
      this.wakeLock = null;
    }
  }

  private async releaseWakeLock(): Promise<void> {
    const lock = this.wakeLock;
    this.wakeLock = null;
    try {
      await lock?.release();
    } catch {
      /* ya liberado */
    }
  }

  /* ---------- tempo ---------- */

  setBpm(value: number): void {
    const bpm = clampBpm(value);
    if (bpm === this.s.bpm) return;
    // Con el aumento progresivo activo, el ajuste manual desplaza la base.
    if (this.state === 'playing' && this.s.practice.ramp.on) this.rampBase += bpm - this.rampApplied;
    this.rampApplied = bpm;
    this.store.update('bpm', (s) => (s.bpm = bpm));
  }

  nudge(delta: number): void {
    this.setBpm(this.s.bpm + delta);
  }

  tap(): void {
    void this.audio.init();
    const bpm = this.tapper.tap(performance.now());
    if (bpm !== null) this.setBpm(bpm);
  }

  /* ---------- metrónomo ---------- */

  setMeter(meter: Meter): void {
    const old = this.s.meter;
    if (sameMeter(old, meter)) return;
    this.store.update('meter', (s) => {
      const subs = subdivisionOptions(meter);
      const oldSub = s.metronome.subdivision;
      // En compases compuestos la subdivisión natural es de tres
      const sub = subs.includes(oldSub) ? oldSub : subs[0];
      s.metronome.steps = remapMetSteps(s.metronome.steps, pulsesPerBar(old), oldSub, pulsesPerBar(meter), sub);
      s.metronome.subdivision = sub;
      s.meter = { ...meter };
    });
  }

  setSubdivision(sub: number): void {
    this.store.update('metronome', (s) => {
      const p = pulsesPerBar(s.meter);
      s.metronome.steps = remapMetSteps(s.metronome.steps, p, s.metronome.subdivision, p, sub);
      s.metronome.subdivision = sub;
      if (sub >= 4 && s.metronome.swing.unit === 2 && s.metronome.swing.amount === 0.5) s.metronome.swing.unit = 4;
    });
  }

  cycleMetStep(i: number): void {
    this.store.update('metronome', (s) => {
      const st = s.metronome.steps[i];
      if (st) st.level = nextMetLevel(st.level);
    });
  }

  setMetStep(i: number, patch: Partial<MetStep>): void {
    this.store.update('metronome', (s) => {
      const st = s.metronome.steps[i];
      if (!st) return;
      if ('level' in patch && patch.level !== undefined) st.level = patch.level;
      if ('sound' in patch) {
        if (patch.sound) st.sound = patch.sound;
        else delete st.sound;
      }
    });
  }

  applyGrouping(groups: number[]): void {
    this.store.update('metronome', (s) => {
      if (groups.reduce((a, b) => a + b, 0) !== pulsesPerBar(s.meter)) return;
      s.metronome.steps = groupingSteps(groups, s.metronome.subdivision);
    });
  }

  /* ---------- polirritmia ---------- */

  updatePoly(fn: (p: AppState['metronome']['poly']) => void): void {
    this.store.update('metronome', (s) => fn(s.metronome.poly));
  }

  addPolyLayer(n: number): void {
    const sounds = ['woodblock', 'cowbell', 'clave', 'rim', 'congaH', 'shaker'];
    this.updatePoly((p) => {
      if (p.layers.length >= 6) return;
      const used = new Set(p.layers.map((l) => l.sound));
      const layer: PolyLayer = {
        id: uid(), n, sound: sounds.find((x) => !used.has(x)) ?? 'woodblock', vol: 0.9, mute: false, accent: true,
      };
      p.layers.push(layer);
      p.on = true;
    });
  }

  /** Aplica una polirritmia N:M: M pulsos en el metrónomo y capas con N golpes. */
  applyPolyPreset(pulses: number, layers: number[]): void {
    const den = this.s.meter.den === 8 && !isCompound(this.s.meter) ? 8 : 4;
    this.setMeter({ num: pulses, den });
    const sounds = ['woodblock', 'cowbell', 'clave'];
    this.updatePoly((p) => {
      p.on = true;
      p.cycleBars = 1;
      p.layers = layers.map((n, i) => ({
        id: uid(), n, sound: p.layers[i]?.sound ?? sounds[i % sounds.length], vol: 0.9, mute: false, accent: true,
      }));
    });
  }

  applyMetPreset(id: MetPresetId): void {
    this.store.update('metronome', (s) => {
      s.metronome.steps = metPreset(id, pulsesPerBar(s.meter), s.metronome.subdivision);
    });
  }

  /* ---------- beat maker ---------- */

  private snapshot(): void {
    this.undoStack.push({ editor: structuredClone(this.s.editor) });
    if (this.undoStack.length > 30) this.undoStack.shift();
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  undo(): void {
    const last = this.undoStack.pop();
    if (last) this.store.update('editor', (s) => (s.editor = last.editor));
  }

  setBeatCell(inst: InstrumentId, i: number, lv: Level, record = true): void {
    const e = this.s.editor;
    const len = pulsesPerBar(e.meter) * e.pattern.stepsPerBeat * e.pattern.bars;
    if (i < 0 || i >= len) return;
    const current = e.pattern.tracks[inst]?.[i] ?? 0;
    if (current === lv) return;
    if (record) this.snapshot();
    this.leavePreview();
    this.store.update('cell', (s) => {
      const t = (s.editor.pattern.tracks[inst] ??= new Array(len).fill(0));
      t[i] = lv;
    });
  }

  /** Al editar, lo que suena pasa a ser el patrón del editor. */
  private leavePreview(): void {
    if (this.preview && this.state !== 'stopped') this.preview = null;
  }

  updateEditor(fn: (e: AppState['editor']) => void, record = true): void {
    if (record) this.snapshot();
    this.leavePreview();
    this.store.update('editor', (s) => fn(s.editor));
  }

  resizeEditor(opts: { meter?: Meter; stepsPerBeat?: number; bars?: number }): void {
    this.updateEditor((e) => {
      const meter = opts.meter ?? e.meter;
      const allowed = beatStepOptions(meter);
      let spb = opts.stepsPerBeat ?? e.pattern.stepsPerBeat;
      if (!allowed.includes(spb)) spb = isCompound(meter) ? 3 : allowed.includes(spb * 2) ? spb * 2 : 4;
      e.pattern = resizePattern(e.pattern, pulsesPerBar(e.meter), pulsesPerBar(meter), spb, opts.bars ?? e.pattern.bars);
      if (spb >= 4 && opts.stepsPerBeat !== undefined) e.pattern.swing.unit = 4;
      if (spb < 4) e.pattern.swing.unit = 2;
      e.meter = { ...meter };
    });
  }

  clearBars(bar: number | null): void {
    this.updateEditor((e) => {
      const per = pulsesPerBar(e.meter) * e.pattern.stepsPerBeat;
      for (const t of Object.values(e.pattern.tracks)) {
        for (let i = 0; i < t.length; i++) if (bar === null || Math.floor(i / per) === bar) t[i] = 0;
      }
    });
  }

  copyBar(from: number, to: number): void {
    this.updateEditor((e) => {
      const per = pulsesPerBar(e.meter) * e.pattern.stepsPerBeat;
      for (const t of Object.values(e.pattern.tracks)) {
        for (let i = 0; i < per; i++) t[to * per + i] = t[from * per + i] ?? 0;
      }
    });
  }

  newGroove(): void {
    this.updateEditor((e) => {
      e.grooveId = null;
      e.name = 'Nuevo groove';
      e.style = 'Mis grooves';
      e.pattern = { ...e.pattern, swing: { ...e.pattern.swing }, tracks: {} };
    });
  }

  loadIntoEditor(g: Groove): void {
    const wasPreviewing = this.state === 'playing' && this.preview?.id === g.id;
    this.snapshot();
    this.store.update(['editor', 'bpm', 'tab'], (s) => {
      const visible = new Set(s.editor.visible);
      for (const [id, t] of Object.entries(g.pattern.tracks)) if (t.some((l) => l > 0)) visible.add(id);
      s.editor = {
        grooveId: g.builtin ? null : g.id,
        name: g.builtin ? `${g.name} (copia)` : g.name,
        style: g.builtin ? 'Mis grooves' : g.style,
        meter: { ...g.meter },
        pattern: clonePattern(g.pattern),
        visible: [...visible],
      };
      s.bpm = g.bpm;
      s.tab = 'beat';
    });
    // Si estaba sonando, continúa sin cortes con la copia editable
    if (wasPreviewing) this.preview = null;
  }

  saveEditor(asNew = false): Groove {
    const e = this.s.editor;
    const id = !asNew && e.grooveId ? e.grooveId : `u:${uid()}`;
    const groove: Groove = {
      id,
      name: e.name.trim() || 'Groove sin nombre',
      style: e.style.trim() || 'Mis grooves',
      bpm: this.s.bpm,
      meter: { ...e.meter },
      pattern: clonePattern(e.pattern),
    };
    this.store.update(['library', 'editor'], (s) => {
      const idx = s.library.user.findIndex((g) => g.id === id);
      if (idx >= 0) s.library.user[idx] = groove;
      else s.library.user.unshift(groove);
      s.editor.grooveId = id;
      s.editor.name = groove.name;
    });
    return groove;
  }

  /* ---------- biblioteca ---------- */

  allGrooves(): Groove[] {
    return [...this.s.library.user, ...BUILTIN_GROOVES];
  }

  toggleFavorite(id: string): void {
    this.store.update('library', (s) => {
      const f = s.library.favorites;
      const i = f.indexOf(id);
      if (i >= 0) f.splice(i, 1);
      else f.push(id);
    });
  }

  duplicateGroove(g: Groove): Groove {
    const copy: Groove = {
      ...structuredClone(g),
      id: `u:${uid()}`,
      name: `${g.name} (copia)`,
      style: g.builtin ? 'Mis grooves' : g.style,
      builtin: undefined,
    };
    this.store.update('library', (s) => s.library.user.unshift(copy));
    return copy;
  }

  renameGroove(id: string, name: string): void {
    this.store.update(['library', 'editor'], (s) => {
      const g = s.library.user.find((x) => x.id === id);
      if (g) g.name = name.trim() || g.name;
      if (s.editor.grooveId === id && g) s.editor.name = g.name;
    });
  }

  deleteGroove(id: string): void {
    if (this.preview?.id === id) this.stop();
    this.store.update(['library', 'editor'], (s) => {
      s.library.user = s.library.user.filter((g) => g.id !== id);
      s.library.favorites = s.library.favorites.filter((f) => f !== id);
      if (s.editor.grooveId === id) s.editor.grooveId = null;
    });
  }

  importGrooves(list: Groove[]): number {
    const known = new Set(this.s.library.user.map((g) => g.id));
    this.store.update('library', (s) => {
      for (const g of list) {
        const copy = { ...g, id: known.has(g.id) || !g.id.startsWith('u:') ? `u:${uid()}` : g.id };
        s.library.user.push(copy);
      }
    });
    return list.length;
  }

  /* ---------- mezcla ---------- */

  applyVolumes(): void {
    const v = this.s.volumes;
    this.audio.setVolumes(v.master, v.metronome, v.beat);
    for (const [id, ch] of Object.entries(this.s.mixer)) this.audio.setChannel(id, ch.vol, ch.mute);
  }

  setChannel(id: InstrumentId, patch: Partial<{ vol: number; mute: boolean }>): void {
    this.store.update('mixer', (s) => {
      const ch = (s.mixer[id] ??= { vol: 1, mute: false });
      Object.assign(ch, patch);
    });
  }

  /** Detiene y vuelve al principio. */
  reset(): void {
    this.stop();
    this.tapper.reset();
  }
}
