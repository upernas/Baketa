import type { Meter } from './types';

export const BPM_MIN = 20;
export const BPM_MAX = 320;

export const COMMON_METERS: Meter[] = [
  { num: 2, den: 4 },
  { num: 3, den: 4 },
  { num: 4, den: 4 },
  { num: 5, den: 4 },
  { num: 6, den: 8 },
  { num: 7, den: 8 },
  { num: 9, den: 8 },
  { num: 12, den: 8 },
];

export const DENOMINATORS = [2, 4, 8, 16];

export const clampBpm = (bpm: number): number =>
  Number.isFinite(bpm) ? Math.min(BPM_MAX, Math.max(BPM_MIN, Math.round(bpm))) : 120;

/** 6/8, 9/8, 12/8… se cuentan en negras con puntillo (grupos de 3 corcheas). */
export const isCompound = (m: Meter): boolean => m.den === 8 && m.num % 3 === 0 && m.num > 3;

export const pulsesPerBar = (m: Meter): number => (isCompound(m) ? m.num / 3 : m.num);

export const meterKey = (m: Meter): string => `${m.num}/${m.den}`;

export const sameMeter = (a: Meter, b: Meter): boolean => a.num === b.num && a.den === b.den;

export function parseMeter(key: string): Meter {
  const [n, d] = key.split('/').map(Number);
  return sanitizeMeter({ num: n, den: d });
}

export function sanitizeMeter(m: Partial<Meter> | undefined): Meter {
  const num = Math.round(Number(m?.num));
  const den = Number(m?.den);
  return {
    num: Number.isFinite(num) ? Math.min(32, Math.max(1, num)) : 4,
    den: DENOMINATORS.includes(den) ? den : 4,
  };
}

/** Figura que recibe el BPM. */
export function pulseUnit(m: Meter): { symbol: string; name: string } {
  if (isCompound(m)) return { symbol: '♩.', name: 'negra con puntillo' };
  switch (m.den) {
    case 2:
      return { symbol: '𝅗𝅥', name: 'blanca' };
    case 8:
      return { symbol: '♪', name: 'corchea' };
    case 16:
      return { symbol: '♬', name: 'semicorchea' };
    default:
      return { symbol: '♩', name: 'negra' };
  }
}

export function subdivisionOptions(m: Meter): number[] {
  return isCompound(m) ? [1, 3, 6] : [1, 2, 3, 4, 5, 6, 8];
}

export function beatStepOptions(m: Meter): number[] {
  return isCompound(m) ? [3, 6] : [2, 3, 4, 6, 8];
}

/**
 * Agrupaciones de pulsos en bloques de 2 y 3 (p. ej. 7 → 2+2+3, 2+3+2, 3+2+2).
 * Útil para acentuar compases irregulares como 5/8, 7/8, 11/8…
 */
export function groupings(pulses: number, max = 16): number[][] {
  const out: number[][] = [];
  const walk = (left: number, acc: number[]) => {
    if (out.length >= max) return;
    if (left === 0) {
      if (acc.length > 1) out.push([...acc]);
      return;
    }
    for (const g of [2, 3]) if (g <= left) walk(left - g, [...acc, g]);
  };
  if (pulses >= 4 && pulses <= 16) walk(pulses, []);
  // Primero las que empiezan por grupos largos al final (2+2+3), como se suelen escribir
  return out.sort((a, b) => a.length - b.length || a.join().localeCompare(b.join()));
}

const BINARY_NAMES: Record<number, string> = {
  1: 'Redondas',
  2: 'Blancas',
  4: 'Negras',
  8: 'Corcheas',
  16: 'Semicorcheas',
  32: 'Fusas',
  64: 'Semifusas',
};

const TUPLET_NAMES: Record<number, string> = { 3: 'Tresillos', 5: 'Quintillos', 6: 'Seisillos', 7: 'Septillos' };

export function subdivisionLabel(m: Meter, sub: number): string {
  if (isCompound(m)) {
    return sub === 1 ? 'Negras con puntillo' : sub === 3 ? 'Corcheas' : 'Semicorcheas';
  }
  if (TUPLET_NAMES[sub]) return TUPLET_NAMES[sub];
  return BINARY_NAMES[m.den * sub] ?? `${sub} por pulso`;
}

/** Sílabas de conteo para cada paso del compás. */
export function countLabels(m: Meter, sub: number): string[] {
  const pulses = pulsesPerBar(m);
  const syllables: string[] =
    sub === 1
      ? []
      : sub === 2
        ? ['&']
        : sub === 3
          ? ['&', 'a']
          : sub === 4 && !isCompound(m)
            ? ['e', '&', 'a']
            : sub === 6 && isCompound(m)
              ? ['·', '&', '·', 'a', '·']
              : Array.from({ length: sub - 1 }, () => '·');
  const out: string[] = [];
  for (let p = 0; p < pulses; p++) {
    out.push(String(p + 1));
    out.push(...syllables);
  }
  return out;
}

const TEMPO_NAMES: [number, string][] = [
  [40, 'Grave'],
  [60, 'Largo'],
  [66, 'Larghetto'],
  [76, 'Adagio'],
  [108, 'Andante'],
  [120, 'Moderato'],
  [156, 'Allegro'],
  [176, 'Vivace'],
  [200, 'Presto'],
];

export function tempoName(bpm: number): string {
  for (const [limit, name] of TEMPO_NAMES) if (bpm < limit) return name;
  return 'Prestissimo';
}
