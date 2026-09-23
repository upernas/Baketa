import { DEFAULT_ROWS, SOUND_MAP } from '../audio/sounds';
import { BUILTIN_GROOVES } from '../data/grooves';
import { clampBpm, pulsesPerBar, sanitizeMeter, subdivisionOptions, beatStepOptions } from './meter';
import { clonePattern, defaultMetSteps, emptyPattern, patternLength } from './patterns';
import type {
  Action, AppState, BeatPattern, ClickMode, Groove, Level, MetStep, PolyLayer, PracticeState, RampAfter, RampMode, SeqBlock, Swing,
} from './types';

export const STORAGE_KEY = 'baketa:state:v1';
export const STATE_VERSION = 1;

export type StoreKey =
  | 'tab' | 'bpm' | 'meter' | 'metronome' | 'editor' | 'cell' | 'beatClick' | 'loop'
  | 'mixer' | 'volumes' | 'practice' | 'library' | 'settings' | 'all';

export const DEFAULT_KEYS: Record<Action, string> = {
  playPause: ' ',
  bpmUp: 'ArrowUp',
  bpmDown: 'ArrowDown',
  tap: 't',
  reset: 'r',
};

export function defaultPractice(): PracticeState {
  return {
    source: 'metronome',
    ramp: {
      on: false, mode: 'bars', from: 0, target: 140,
      everyBars: 4, step: 2, bars: 32, seconds: 300,
      after: 'hold', hold: 4,
    },
    gap: { on: false, random: false, playBars: 2, muteBars: 2, chance: 30, what: 'click' },
    sequence: {
      on: false,
      repeats: 0,
      blocks: [
        { bars: 4, bpm: 0, mode: 'full', sub: 0 },
        { bars: 4, bpm: 0, mode: 'beats', sub: 0 },
        { bars: 4, bpm: 0, mode: 'silent', sub: 0 },
      ],
    },
    timer: { on: false, by: 'time', seconds: 600, bars: 32 },
  };
}

export function defaultState(): AppState {
  const rock = BUILTIN_GROOVES.find((g) => g.id === 'b:rock-8') ?? BUILTIN_GROOVES[0];
  return {
    version: STATE_VERSION,
    tab: 'metronome',
    bpm: 100,
    meter: { num: 4, den: 4 },
    metronome: {
      subdivision: 1,
      steps: defaultMetSteps(4, 1),
      sounds: { accent: 'clickHi', beat: 'click', sub: 'click' },
      swing: { amount: 0.5, unit: 2 },
      poly: {
        on: false,
        cycleBars: 1,
        layers: [{ id: 'p1', n: 3, sound: 'woodblock', vol: 0.9, mute: false, accent: true }],
      },
    },
    editor: {
      grooveId: null,
      name: 'Mi groove',
      style: 'Mis grooves',
      meter: { ...rock.meter },
      pattern: clonePattern(rock.pattern),
      visible: [...DEFAULT_ROWS],
    },
    beatClick: false,
    loop: true,
    mixer: {},
    volumes: { master: 0.9, metronome: 0.85, beat: 0.85 },
    practice: defaultPractice(),
    library: { user: [], favorites: [] },
    settings: {
      theme: 'dark',
      flash: false,
      wakeLock: true,
      visualOffsetMs: 0,
      keys: { ...DEFAULT_KEYS },
    },
  };
}

/* ---------- validación ---------- */

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown, d: number, min = -Infinity, max = Infinity): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : d;
const bool = (v: unknown, d: boolean): boolean => (typeof v === 'boolean' ? v : d);
const str = (v: unknown, d: string, max = 80): string => (typeof v === 'string' ? v.slice(0, max) : d);
const level = (v: unknown): Level => ([0, 1, 2, 3].includes(v as number) ? (v as Level) : 0);
const sound = (v: unknown, d: string): string => (typeof v === 'string' && SOUND_MAP.has(v) ? v : d);
const CLICK_MODES: ClickMode[] = ['full', 'beats', 'downbeat', 'silent'];

function swingOf(v: unknown, d: Swing): Swing {
  if (!isObj(v)) return d;
  return { amount: num(v.amount, d.amount, 0.5, 0.75), unit: v.unit === 4 ? 4 : 2 };
}

export function sanitizePattern(v: unknown, pulses: number, allowedSpb: number[]): BeatPattern | null {
  if (!isObj(v)) return null;
  const spb = allowedSpb.includes(v.stepsPerBeat as number) ? (v.stepsPerBeat as number) : null;
  if (spb === null) return null;
  const p = emptyPattern(spb, Math.round(num(v.bars, 1, 1, 8)));
  p.swing = swingOf(v.swing, p.swing);
  const len = patternLength(p, pulses);
  if (isObj(v.tracks)) {
    for (const [id, t] of Object.entries(v.tracks)) {
      if (!SOUND_MAP.get(id)?.instrument) continue;
      const arr = typeof t === 'string' ? [...t.replace(/[\s|]/g, '')].map((c) => ({ X: 3, x: 2, g: 1 })[c] ?? 0) : t;
      if (!Array.isArray(arr)) continue;
      const track: Level[] = new Array(len).fill(0);
      for (let i = 0; i < len; i++) track[i] = level(arr[i]);
      p.tracks[id] = track;
    }
  }
  return p;
}

export function sanitizeGroove(v: unknown): Groove | null {
  if (!isObj(v)) return null;
  const meter = sanitizeMeter(isObj(v.meter) ? v.meter : undefined);
  const pattern = sanitizePattern(v.pattern, pulsesPerBar(meter), beatStepOptions(meter));
  if (!pattern) return null;
  return {
    id: str(v.id, '', 40) || `u:${Math.random().toString(36).slice(2, 10)}`,
    name: str(v.name, 'Groove sin nombre') || 'Groove sin nombre',
    style: str(v.style, 'Mis grooves', 40) || 'Mis grooves',
    bpm: clampBpm(num(v.bpm, 100)),
    meter,
    pattern,
    notes: typeof v.notes === 'string' ? v.notes.slice(0, 300) : undefined,
    level: v.level === 2 || v.level === 3 ? v.level : undefined,
  };
}

const RAMP_MODES: RampMode[] = ['step', 'bars', 'time'];
const RAMP_AFTER: RampAfter[] = ['hold', 'restart', 'stop'];

function sanitizePractice(p: Obj): PracticeState {
  const d = defaultPractice();
  const r = isObj(p.ramp) ? p.ramp : {};
  const g = isObj(p.gap) ? p.gap : {};
  const q = isObj(p.sequence) ? p.sequence : {};
  const t = isObj(p.timer) ? p.timer : {};
  // Formato antiguo (v0.4): { everyBars, step, limit }
  const legacyRamp = r.mode === undefined && typeof r.limit === 'number';
  return {
    source: p.source === 'beat' ? 'beat' : 'metronome',
    ramp: {
      on: bool(r.on, false),
      mode: legacyRamp ? 'step' : RAMP_MODES.includes(r.mode as RampMode) ? (r.mode as RampMode) : d.ramp.mode,
      from: r.from === 0 || r.from === undefined ? 0 : clampBpm(num(r.from, 0)),
      target: clampBpm(num(legacyRamp ? r.limit : r.target, d.ramp.target)),
      everyBars: Math.round(num(r.everyBars, d.ramp.everyBars, 1, 64)),
      step: Math.round(Math.abs(num(r.step, d.ramp.step, -40, 40))) || 1,
      bars: Math.round(num(r.bars, d.ramp.bars, 1, 2000)),
      seconds: Math.round(num(r.seconds, d.ramp.seconds, 5, 36000)),
      after: RAMP_AFTER.includes(r.after as RampAfter) ? (r.after as RampAfter) : 'hold',
      hold: Math.round(num(r.hold, d.ramp.hold, 0, 3600)),
    },
    gap: {
      on: bool(g.on, false),
      random: bool(g.random, false),
      playBars: Math.round(num(g.playBars, d.gap.playBars, 0, 64)),
      muteBars: Math.round(num(g.muteBars, d.gap.muteBars, 0, 64)),
      chance: Math.round(num(g.chance, d.gap.chance, 0, 100)),
      what: g.what === 'all' ? 'all' : 'click',
    },
    sequence: {
      on: bool(q.on, false),
      repeats: typeof q.repeats === 'number' ? Math.round(num(q.repeats, 0, 0, 99)) : q.loop === false ? 1 : 0,
      blocks: Array.isArray(q.blocks)
        ? q.blocks.filter(isObj).slice(0, 32).map((b): SeqBlock => ({
            bars: Math.round(num(b.bars, 4, 1, 256)),
            bpm: b.bpm === 0 ? 0 : clampBpm(num(b.bpm, 0)),
            mode: CLICK_MODES.includes(b.mode as ClickMode) ? (b.mode as ClickMode) : 'full',
            sub: [1, 2, 3, 4, 5, 6, 8].includes(b.sub as number) ? (b.sub as number) : 0,
          }))
        : d.sequence.blocks,
    },
    timer: {
      on: bool(t.on, false),
      by: t.by === 'bars' ? 'bars' : 'time',
      seconds: Math.round(num(t.seconds, d.timer.seconds, 5, 36000)),
      bars: Math.round(num(t.bars, d.timer.bars, 1, 9999)),
    },
  };
}

function sanitizeLayer(v: unknown, i: number): PolyLayer | null {
  if (!isObj(v)) return null;
  return {
    id: str(v.id, `p${i + 1}`, 20) || `p${i + 1}`,
    n: Math.round(num(v.n, 3, 1, 32)),
    sound: sound(v.sound, 'woodblock'),
    vol: num(v.vol, 0.9, 0, 1.5),
    mute: bool(v.mute, false),
    accent: bool(v.accent, true),
  };
}

/** Combina datos guardados (o importados) con los valores por defecto, descartando lo inválido. */
export function hydrate(raw: unknown): AppState {
  const s = defaultState();
  if (!isObj(raw)) return s;

  if (['metronome', 'beat', 'grooves', 'practice', 'settings'].includes(raw.tab as string)) s.tab = raw.tab as AppState['tab'];
  s.bpm = clampBpm(num(raw.bpm, s.bpm));
  if (isObj(raw.meter)) s.meter = sanitizeMeter(raw.meter);

  if (isObj(raw.metronome)) {
    const m = raw.metronome;
    const subs = subdivisionOptions(s.meter);
    const sub = subs.includes(m.subdivision as number) ? (m.subdivision as number) : 1;
    const pulses = pulsesPerBar(s.meter);
    const steps: MetStep[] = Array.isArray(m.steps) && m.steps.length === pulses * sub
      ? m.steps.map((st): MetStep => {
          const o = isObj(st) ? st : {};
          const snd = typeof o.sound === 'string' && SOUND_MAP.has(o.sound) ? o.sound : undefined;
          return snd ? { level: level(o.level), sound: snd } : { level: level(o.level) };
        })
      : defaultMetSteps(pulses, sub);
    const snd = isObj(m.sounds) ? m.sounds : {};
    s.metronome = {
      subdivision: sub,
      steps,
      sounds: {
        accent: sound(snd.accent, s.metronome.sounds.accent),
        beat: sound(snd.beat, s.metronome.sounds.beat),
        sub: sound(snd.sub, s.metronome.sounds.sub),
      },
      swing: swingOf(m.swing, s.metronome.swing),
      poly: s.metronome.poly,
    };
    if (isObj(m.poly)) {
      const layers = Array.isArray(m.poly.layers)
        ? m.poly.layers.slice(0, 6).map(sanitizeLayer).filter((l): l is PolyLayer => l !== null)
        : s.metronome.poly.layers;
      s.metronome.poly = {
        on: bool(m.poly.on, false),
        cycleBars: [1, 2, 3, 4].includes(m.poly.cycleBars as number) ? (m.poly.cycleBars as number) : 1,
        layers,
      };
    }
  }

  if (isObj(raw.editor)) {
    const e = raw.editor;
    const meter = sanitizeMeter(isObj(e.meter) ? e.meter : undefined);
    const pattern = sanitizePattern(e.pattern, pulsesPerBar(meter), beatStepOptions(meter));
    if (pattern) {
      s.editor = {
        grooveId: typeof e.grooveId === 'string' ? e.grooveId : null,
        name: str(e.name, s.editor.name),
        style: str(e.style, s.editor.style, 40),
        meter,
        pattern,
        visible: Array.isArray(e.visible)
          ? e.visible.filter((id): id is string => typeof id === 'string' && !!SOUND_MAP.get(id)?.instrument)
          : s.editor.visible,
      };
    }
  }

  s.beatClick = bool(raw.beatClick, s.beatClick);
  s.loop = bool(raw.loop, s.loop);

  if (isObj(raw.mixer)) {
    for (const [id, ch] of Object.entries(raw.mixer)) {
      if (SOUND_MAP.get(id)?.instrument && isObj(ch)) {
        s.mixer[id] = { vol: num(ch.vol, 1, 0, 1.5), mute: bool(ch.mute, false) };
      }
    }
  }

  if (isObj(raw.volumes)) {
    const v = raw.volumes;
    s.volumes = {
      master: num(v.master, s.volumes.master, 0, 1),
      metronome: num(v.metronome, s.volumes.metronome, 0, 1.5),
      beat: num(v.beat, s.volumes.beat, 0, 1.5),
    };
  }

  if (isObj(raw.practice)) s.practice = sanitizePractice(raw.practice);

  if (isObj(raw.library)) {
    const l = raw.library;
    s.library.user = Array.isArray(l.user)
      ? l.user.map(sanitizeGroove).filter((g): g is Groove => g !== null)
      : [];
    s.library.favorites = Array.isArray(l.favorites)
      ? l.favorites.filter((f): f is string => typeof f === 'string')
      : [];
  }

  if (isObj(raw.settings)) {
    const st = raw.settings;
    const keys = isObj(st.keys) ? st.keys : {};
    s.settings = {
      theme: st.theme === 'light' ? 'light' : 'dark',
      flash: bool(st.flash, false),
      wakeLock: bool(st.wakeLock, true),
      visualOffsetMs: Math.round(num(st.visualOffsetMs, 0, -200, 200)),
      keys: Object.fromEntries(
        (Object.keys(DEFAULT_KEYS) as Action[]).map((a) => [a, str(keys[a], DEFAULT_KEYS[a], 20)]),
      ) as Record<Action, string>,
    };
  }
  return s;
}

/* ---------- store ---------- */

type Listener = (keys: Set<StoreKey>) => void;

export class Store {
  state: AppState;
  private listeners = new Set<Listener>();
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private queued = new Set<StoreKey>();
  private flushQueued = false;

  constructor(initial?: AppState) {
    this.state = initial ?? Store.load();
  }

  static load(): AppState {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return hydrate(raw ? JSON.parse(raw) : null);
    } catch {
      return defaultState();
    }
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /**
   * Modifica el estado y notifica. Las notificaciones se agrupan en un microtask
   * para que varias actualizaciones seguidas provoquen un solo repintado.
   */
  update(keys: StoreKey | StoreKey[], fn: (s: AppState) => void, persist = true): void {
    fn(this.state);
    for (const k of Array.isArray(keys) ? keys : [keys]) this.queued.add(k);
    if (!this.flushQueued) {
      this.flushQueued = true;
      queueMicrotask(() => {
        this.flushQueued = false;
        const batch = new Set(this.queued);
        this.queued.clear();
        for (const l of this.listeners) l(batch);
      });
    }
    if (persist) this.scheduleSave();
  }

  replace(next: AppState): void {
    this.state = next;
    this.update('all', () => undefined);
  }

  private scheduleSave(): void {
    if (this.saveTimer !== null) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.save(), 400);
  }

  save(): boolean {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
      return true;
    } catch {
      return false;
    }
  }
}
