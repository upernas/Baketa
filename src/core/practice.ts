import { clampBpm } from './meter';
import type { ClickMode, PracticeState, RampState, SeqBlock, TimerState } from './types';

export type EndReason = 'timer' | 'sequence' | 'ramp' | 'pattern';

export interface BarPlan {
  /** null = no tocar el tempo */
  bpm: number | null;
  /** Qué hace el click (y las capas de polirritmia) en este compás */
  mode: ClickMode;
  /** Silenciar también el beat */
  muteBeat: boolean;
  /** Clicks por pulso forzados por la secuencia (0 = los del metrónomo) */
  sub: number;
  /** Bloque de la secuencia (-1 si no hay) */
  block: number;
  stop: EndReason | null;
}

export const CLICK_MODES: { value: ClickMode; label: string }[] = [
  { value: 'full', label: 'Click completo' },
  { value: 'beats', label: 'Solo pulsos' },
  { value: 'downbeat', label: 'Solo el 1' },
  { value: 'silent', label: 'Silencio' },
];

export const sequenceLength = (blocks: SeqBlock[]): number =>
  blocks.reduce((n, b) => n + Math.max(0, b.bars), 0);

export const sequenceActive = (p: PracticeState): boolean => p.sequence.on && sequenceLength(p.sequence.blocks) > 0;

export const isPracticeActive = (p: PracticeState): boolean =>
  sequenceActive(p) || p.ramp.on || p.gap.on || p.timer.on;

/* ---------- subida / bajada de tempo ---------- */

/** Cuánto dura la rampa hasta el objetivo, en su unidad (compases o segundos). */
export function rampReach(r: RampState, from: number): number {
  if (r.mode === 'time') return Math.max(1, r.seconds);
  if (r.mode === 'bars') return Math.max(1, r.bars);
  const diff = Math.abs(r.target - from);
  if (diff === 0) return 0;
  return Math.ceil(diff / Math.max(1, Math.abs(r.step))) * Math.max(1, r.everyBars);
}

/** Tiempo en el objetivo antes de repetir o parar. En modos por compases, al menos un compás. */
const rampHold = (r: RampState): number =>
  r.mode === 'time' ? Math.max(0, r.hold) : Math.max(1, Math.round(r.hold));

/** Tempo (sin redondear) en la posición x: compases o segundos desde el inicio del ciclo. */
export function rampValue(r: RampState, from: number, x: number): number {
  const diff = r.target - from;
  if (diff === 0) return from;
  if (r.mode === 'step') {
    const k = Math.floor(x / Math.max(1, r.everyBars));
    return from + Math.sign(diff) * Math.min(Math.abs(diff), k * Math.max(1, Math.abs(r.step)));
  }
  return from + diff * Math.min(1, Math.max(0, x / rampReach(r, from)));
}

export function planRamp(
  r: RampState,
  from: number,
  bar: number,
  elapsed: number,
): { bpm: number; stop: boolean; progress: number } {
  let x = r.mode === 'time' ? elapsed : bar;
  const reach = rampReach(r, from);
  const cycle = reach + rampHold(r);
  if (r.after === 'restart' && cycle > 0) x %= cycle;
  const stop = r.after === 'stop' && x >= cycle - 1e-9;
  return {
    bpm: clampBpm(rampValue(r, from, x)),
    stop,
    progress: reach > 0 ? Math.min(1, x / reach) : 1,
  };
}

/* ---------- silencios ---------- */

/** Pseudoaleatorio reproducible por compás (0..1). */
export function barRandom(bar: number, seed: number): number {
  let h = Math.imul(bar + 1, 0x9e3779b1) ^ Math.imul(seed | 0, 0x85ebca77);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  h = Math.imul(h, 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

export function isGapBar(p: PracticeState, bar: number, seed: number): boolean {
  const g = p.gap;
  if (!g.on) return false;
  if (g.random) return bar >= g.playBars && barRandom(bar, seed) < g.chance / 100;
  const cycle = Math.max(0, g.playBars) + Math.max(0, g.muteBars);
  return cycle > 0 && g.muteBars > 0 && bar % cycle >= g.playBars;
}

/* ---------- plan de cada compás ---------- */

/**
 * Qué ocurre en el compás `bar` (0 = primero), que empieza `elapsed` segundos después del inicio.
 * La secuencia tiene prioridad sobre la rampa y los silencios.
 */
export function planBar(p: PracticeState, from: number, bar: number, elapsed: number, seed = 0): BarPlan {
  const plan: BarPlan = { bpm: null, mode: 'full', muteBeat: false, sub: 0, block: -1, stop: null };

  if (sequenceActive(p)) {
    const total = sequenceLength(p.sequence.blocks);
    const reps = Math.max(0, Math.round(p.sequence.repeats));
    if (reps > 0 && bar >= total * reps) return { ...plan, stop: 'sequence' };
    let b = bar % total;
    for (let i = 0; i < p.sequence.blocks.length; i++) {
      const block = p.sequence.blocks[i];
      if (block.bars <= 0) continue;
      if (b < block.bars) {
        return {
          ...plan,
          bpm: block.bpm > 0 ? clampBpm(block.bpm) : null,
          mode: block.mode,
          muteBeat: block.mode === 'silent',
          sub: block.sub,
          block: i,
        };
      }
      b -= block.bars;
    }
  }

  if (p.ramp.on) {
    const r = planRamp(p.ramp, from, bar, elapsed);
    if (r.stop) return { ...plan, stop: 'ramp' };
    plan.bpm = r.bpm;
  }

  if (isGapBar(p, bar, seed)) {
    plan.mode = 'silent';
    plan.muteBeat = p.gap.what === 'all';
  }
  return plan;
}

export function timerLimit(t: TimerState): { bars: number; seconds: number } {
  if (!t.on) return { bars: 0, seconds: 0 };
  return t.by === 'bars'
    ? { bars: Math.max(1, Math.round(t.bars)), seconds: 0 }
    : { bars: 0, seconds: Math.max(1, t.seconds) };
}

/* ---------- estimaciones para la interfaz ---------- */

const MAX_BARS = 20000;

/** Compases y segundos que tarda la rampa en llegar al objetivo. */
export function rampEstimate(r: RampState, from: number, pulses: number): { bars: number; seconds: number } {
  const reach = rampReach(r, from);
  if (r.mode === 'time') {
    let e = 0;
    let bars = 0;
    while (e < reach && bars < MAX_BARS) {
      e += (pulses * 60) / clampBpm(rampValue(r, from, e));
      bars++;
    }
    return { bars, seconds: reach };
  }
  let seconds = 0;
  for (let b = 0; b < Math.min(reach, MAX_BARS); b++) seconds += (pulses * 60) / clampBpm(rampValue(r, from, b));
  return { bars: reach, seconds };
}

/** Duración de una pasada de la secuencia. */
export function sequenceEstimate(blocks: SeqBlock[], bpm: number, pulses: number): { bars: number; seconds: number } {
  let seconds = 0;
  for (const b of blocks) seconds += (Math.max(0, b.bars) * pulses * 60) / (b.bpm > 0 ? b.bpm : bpm);
  return { bars: sequenceLength(blocks), seconds };
}

export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h) return `${h} h ${m} min`;
  if (m) return sec ? `${m} min ${sec} s` : `${m} min`;
  return `${sec} s`;
}

export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}
