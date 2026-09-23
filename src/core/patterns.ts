import type { BeatPattern, InstrumentId, Level, MetStep, SoundId, Swing } from './types';

export const uid = (): string =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

/* ---------- Metrónomo ---------- */

export function defaultMetSteps(pulses: number, sub: number): MetStep[] {
  const steps: MetStep[] = [];
  for (let p = 0; p < pulses; p++) {
    for (let s = 0; s < sub; s++) steps.push({ level: s === 0 ? (p === 0 ? 3 : 2) : 1 });
  }
  return steps;
}

/**
 * Adapta un patrón de metrónomo a otro compás/subdivisión conservando
 * los pasos que caen en la misma posición temporal.
 */
export function remapMetSteps(
  old: MetStep[],
  oldPulses: number,
  oldSub: number,
  pulses: number,
  sub: number,
): MetStep[] {
  const next = defaultMetSteps(pulses, sub);
  if (old.length !== oldPulses * oldSub) return next;
  for (let p = 0; p < Math.min(oldPulses, pulses); p++) {
    for (let s = 0; s < sub; s++) {
      const pos = (s * oldSub) / sub;
      if (Number.isInteger(pos)) next[p * sub + s] = { ...old[p * oldSub + pos] };
    }
  }
  return next;
}

export const MET_PRESETS = [
  { id: 'standard', label: 'Acento en el 1' },
  { id: 'noAccent', label: 'Sin acento' },
  { id: 'backbeat', label: 'Acento en 2 y 4' },
  { id: 'pulsesOnly', label: 'Solo pulsos' },
  { id: 'downbeatOnly', label: 'Solo el 1' },
  { id: 'kit', label: 'Bombo · hi-hat · caja · hi-hat' },
  { id: 'rock', label: 'Bombo y caja, hi-hat en subdivisiones' },
  { id: 'clear', label: 'Todo en silencio' },
] as const;

export type MetPresetId = (typeof MET_PRESETS)[number]['id'];

export function metPreset(id: MetPresetId, pulses: number, sub: number): MetStep[] {
  const steps = defaultMetSteps(pulses, sub);
  const kit: SoundId[] = ['kick', 'hhc', 'snare', 'hhc'];
  return steps.map((st, i): MetStep => {
    const p = Math.floor(i / sub);
    const s = i % sub;
    switch (id) {
      case 'noAccent':
        return s === 0 ? { level: 2 } : st;
      case 'backbeat':
        return s === 0 ? { level: p % 2 === 1 ? 3 : 2 } : st;
      case 'pulsesOnly':
        return s === 0 ? st : { level: 0 };
      case 'downbeatOnly':
        return i === 0 ? { level: 3 } : { level: 0 };
      case 'kit':
        return s === 0 ? { level: 2, sound: kit[p % 4] } : { level: 1, sound: 'hhc' };
      case 'rock':
        return s === 0
          ? { level: 2, sound: p % 2 === 0 ? 'kick' : 'snare' }
          : { level: 1, sound: 'hhc' };
      case 'clear':
        return { level: 0 };
      default:
        return st;
    }
  });
}

/** Acentos según una agrupación: 3 en el 1, 2 en cada cabeza de grupo, 1 en el resto. */
export function groupingSteps(groups: number[], sub: number): MetStep[] {
  const heads = new Set<number>();
  let acc = 0;
  for (const g of groups) {
    heads.add(acc);
    acc += g;
  }
  const steps: MetStep[] = [];
  for (let p = 0; p < acc; p++) {
    for (let s = 0; s < sub; s++) {
      steps.push({ level: s > 0 ? 1 : p === 0 ? 3 : heads.has(p) ? 2 : 1 });
    }
  }
  return steps;
}

/** Orden al tocar un paso: silencio → normal → acento → suave → silencio */
export const nextMetLevel = (l: Level): Level => ({ 0: 2, 2: 3, 3: 1, 1: 0 })[l] as Level;

/* ---------- Beat maker ---------- */

const CHAR_LEVEL: Record<string, Level> = { X: 3, x: 2, o: 2, g: 1, '.': 0, '-': 0, _: 0 };
const LEVEL_CHAR = ['.', 'g', 'x', 'X'];

export function parseTrack(src: string): Level[] {
  return [...src.replace(/[\s|]/g, '')].map((c) => CHAR_LEVEL[c] ?? 0);
}

export function trackToString(track: Level[], stepsPerBar: number): string {
  const chars = track.map((l) => LEVEL_CHAR[l] ?? '.');
  const bars: string[] = [];
  for (let i = 0; i < chars.length; i += stepsPerBar) bars.push(chars.slice(i, i + stepsPerBar).join(''));
  return bars.join('|');
}

export const patternLength = (p: BeatPattern, pulses: number): number =>
  pulses * p.stepsPerBeat * p.bars;

export function emptyPattern(stepsPerBeat: number, bars: number, swing?: Swing): BeatPattern {
  return {
    stepsPerBeat,
    bars,
    swing: swing ?? { amount: 0.5, unit: stepsPerBeat >= 4 ? 4 : 2 },
    tracks: {},
  };
}

export function clonePattern(p: BeatPattern): BeatPattern {
  const tracks: Record<InstrumentId, Level[]> = {};
  for (const [k, v] of Object.entries(p.tracks)) tracks[k] = [...v];
  return { stepsPerBeat: p.stepsPerBeat, bars: p.bars, swing: { ...p.swing }, tracks };
}

export function isPatternEmpty(p: BeatPattern): boolean {
  return Object.values(p.tracks).every((t) => t.every((l) => l === 0));
}

/**
 * Cambia pulsos por compás, resolución o número de compases.
 * Las notas se conservan por posición temporal; al añadir compases se repiten los existentes.
 */
export function resizePattern(
  p: BeatPattern,
  oldPulses: number,
  pulses: number,
  stepsPerBeat: number,
  bars: number,
): BeatPattern {
  const out: BeatPattern = { ...emptyPattern(stepsPerBeat, bars, { ...p.swing }), tracks: {} };
  const newLen = pulses * stepsPerBeat * bars;
  const oldSpb = p.stepsPerBeat;
  for (const [id, track] of Object.entries(p.tracks)) {
    const next: Level[] = new Array(newLen).fill(0);
    for (let i = 0; i < newLen; i++) {
      const bar = Math.floor(i / (pulses * stepsPerBeat)) % Math.max(1, p.bars);
      const inBar = i % (pulses * stepsPerBeat);
      const pulse = Math.floor(inBar / stepsPerBeat);
      if (pulse >= oldPulses) continue;
      const pos = ((inBar % stepsPerBeat) * oldSpb) / stepsPerBeat;
      if (!Number.isInteger(pos)) continue;
      next[i] = track[bar * oldPulses * oldSpb + pulse * oldSpb + pos] ?? 0;
    }
    out.tracks[id] = next;
  }
  return out;
}

/** Cuenta cuántas notas se perderían con un redimensionado. */
export function lostHits(before: BeatPattern, after: BeatPattern): number {
  const count = (p: BeatPattern) =>
    Object.values(p.tracks).reduce((n, t) => n + t.filter((l) => l > 0).length, 0);
  const b = count(before);
  const a = count(after);
  // Al añadir compases las notas se duplican; solo interesa la pérdida por compás.
  return Math.max(0, b / Math.max(1, before.bars) - a / Math.max(1, after.bars));
}
