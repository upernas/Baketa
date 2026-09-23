/**
 * Todos los sonidos se generan por síntesis en el propio navegador.
 * No se usa ningún sample externo, así que no hay dependencias de licencias de audio:
 * los sonidos se distribuyen bajo la misma licencia que el código (MIT).
 *
 * Para añadir un sonido nuevo basta con añadir una entrada a SOUNDS.
 * Para usar un sample propio, ver AudioEngine.loadSample().
 */

export type SoundGroup = 'click' | 'kit' | 'perc';

export interface SoundDef {
  id: string;
  label: string;
  short: string;
  group: SoundGroup;
  /** Duración del buffer renderizado (s) */
  length: number;
  /** Nivel relativo tras normalizar */
  level: number;
  /** Disponible como fila del beat maker */
  instrument: boolean;
  build: (c: BaseAudioContext, out: AudioNode, noise: AudioBuffer) => void;
}

interface ToneOpts {
  type?: OscillatorType;
  f0: number;
  f1?: number;
  sweep?: number;
  gain?: number;
  attack?: number;
  decay: number;
  delay?: number;
  filter?: FilterOpts[];
}

interface FilterOpts {
  type: BiquadFilterType;
  f: number;
  q?: number;
}

interface NoiseOpts {
  gain?: number;
  attack?: number;
  decay: number;
  delay?: number;
  filter?: FilterOpts[];
}

function chain(c: BaseAudioContext, from: AudioNode, filters: FilterOpts[] | undefined): AudioNode {
  let node = from;
  for (const f of filters ?? []) {
    const bq = c.createBiquadFilter();
    bq.type = f.type;
    bq.frequency.value = f.f;
    if (f.q !== undefined) bq.Q.value = f.q;
    node.connect(bq);
    node = bq;
  }
  return node;
}

function envelope(c: BaseAudioContext, gain: number, attack: number, decay: number, delay: number): GainNode {
  const g = c.createGain();
  g.gain.setValueAtTime(0, delay);
  g.gain.linearRampToValueAtTime(gain, delay + attack);
  g.gain.exponentialRampToValueAtTime(0.0005, delay + attack + decay);
  g.gain.linearRampToValueAtTime(0, delay + attack + decay + 0.005);
  return g;
}

function tone(c: BaseAudioContext, out: AudioNode, o: ToneOpts): void {
  const delay = o.delay ?? 0;
  const attack = o.attack ?? 0.0015;
  const osc = c.createOscillator();
  osc.type = o.type ?? 'sine';
  osc.frequency.setValueAtTime(o.f0, delay);
  if (o.f1 !== undefined && o.f1 !== o.f0) {
    osc.frequency.exponentialRampToValueAtTime(o.f1, delay + (o.sweep ?? 0.05));
  }
  const env = envelope(c, o.gain ?? 1, attack, o.decay, delay);
  chain(c, osc, o.filter).connect(env);
  env.connect(out);
  osc.start(delay);
  osc.stop(delay + attack + o.decay + 0.02);
}

function noise(c: BaseAudioContext, out: AudioNode, buf: AudioBuffer, o: NoiseOpts): void {
  const delay = o.delay ?? 0;
  const attack = o.attack ?? 0.001;
  const src = c.createBufferSource();
  src.buffer = buf;
  const env = envelope(c, o.gain ?? 1, attack, o.decay, delay);
  chain(c, src, o.filter).connect(env);
  env.connect(out);
  src.start(delay, delay * 7.3);
  src.stop(delay + attack + o.decay + 0.02);
}

/** Timbre metálico: suma de ondas cuadradas con relaciones no armónicas. */
const METAL_RATIOS = [2, 3, 4.16, 5.43, 6.79, 8.21];

function metal(
  c: BaseAudioContext,
  out: AudioNode,
  o: { base?: number; gain: number; decay: number; hp: number; bp: number; attack?: number },
): void {
  const mix = c.createGain();
  mix.gain.value = 1 / METAL_RATIOS.length;
  const end = (o.attack ?? 0.001) + o.decay + 0.02;
  for (const r of METAL_RATIOS) {
    const osc = c.createOscillator();
    osc.type = 'square';
    osc.frequency.value = (o.base ?? 40) * r;
    osc.connect(mix);
    osc.start(0);
    osc.stop(end);
  }
  const env = envelope(c, o.gain, o.attack ?? 0.001, o.decay, 0);
  chain(c, mix, [
    { type: 'bandpass', f: o.bp },
    { type: 'highpass', f: o.hp },
  ]).connect(env);
  env.connect(out);
}

const bp = (f: number, q = 1): FilterOpts => ({ type: 'bandpass', f, q });
const hp = (f: number): FilterOpts => ({ type: 'highpass', f });
const lp = (f: number): FilterOpts => ({ type: 'lowpass', f });

export const SOUNDS: SoundDef[] = [
  // --- Clicks de metrónomo ---
  {
    id: 'click', label: 'Click clásico', short: 'CL', group: 'click', length: 0.08, level: 0.9, instrument: false,
    build: (c, out, n) => {
      noise(c, out, n, { gain: 0.8, decay: 0.012, filter: [bp(3200, 1.2)] });
      tone(c, out, { f0: 1250, decay: 0.03, gain: 0.7 });
    },
  },
  {
    id: 'clickHi', label: 'Click agudo', short: 'CA', group: 'click', length: 0.08, level: 0.95, instrument: false,
    build: (c, out, n) => {
      noise(c, out, n, { gain: 0.8, decay: 0.012, filter: [bp(5600, 1.2)] });
      tone(c, out, { f0: 2100, decay: 0.035, gain: 0.8 });
    },
  },
  {
    id: 'beep', label: 'Beep', short: 'BP', group: 'click', length: 0.12, level: 0.75, instrument: false,
    build: (c, out) => tone(c, out, { f0: 880, decay: 0.07, attack: 0.002 }),
  },
  {
    id: 'beepHi', label: 'Beep agudo', short: 'BA', group: 'click', length: 0.12, level: 0.75, instrument: false,
    build: (c, out) => tone(c, out, { f0: 1760, decay: 0.07, attack: 0.002 }),
  },
  {
    id: 'digital', label: 'Electrónico', short: 'EL', group: 'click', length: 0.08, level: 0.55, instrument: false,
    build: (c, out) => tone(c, out, { type: 'square', f0: 1000, decay: 0.035, filter: [lp(4200)] }),
  },
  {
    id: 'woodblock', label: 'Wood block', short: 'WB', group: 'click', length: 0.12, level: 0.9, instrument: true,
    build: (c, out, n) => {
      tone(c, out, { f0: 880, f1: 860, sweep: 0.02, decay: 0.065 });
      tone(c, out, { type: 'triangle', f0: 2450, decay: 0.014, gain: 0.35 });
      noise(c, out, n, { gain: 0.35, decay: 0.006, filter: [bp(2200, 2)] });
    },
  },
  {
    id: 'woodblockHi', label: 'Wood block agudo', short: 'WA', group: 'click', length: 0.1, level: 0.9, instrument: false,
    build: (c, out, n) => {
      tone(c, out, { f0: 1260, f1: 1230, sweep: 0.02, decay: 0.055 });
      tone(c, out, { type: 'triangle', f0: 3300, decay: 0.012, gain: 0.35 });
      noise(c, out, n, { gain: 0.35, decay: 0.006, filter: [bp(3000, 2)] });
    },
  },
  // --- Batería ---
  {
    id: 'kick', label: 'Bombo', short: 'BO', group: 'kit', length: 0.55, level: 1, instrument: true,
    build: (c, out, n) => {
      tone(c, out, { f0: 165, f1: 46, sweep: 0.11, decay: 0.45, gain: 1, attack: 0.001 });
      tone(c, out, { type: 'triangle', f0: 90, f1: 50, sweep: 0.08, decay: 0.18, gain: 0.35 });
      noise(c, out, n, { gain: 0.45, decay: 0.012, filter: [lp(2200)] });
    },
  },
  {
    id: 'snare', label: 'Caja', short: 'CJ', group: 'kit', length: 0.35, level: 0.9, instrument: true,
    build: (c, out, n) => {
      tone(c, out, { type: 'triangle', f0: 200, f1: 160, sweep: 0.05, decay: 0.11, gain: 0.8 });
      tone(c, out, { f0: 330, decay: 0.05, gain: 0.25 });
      noise(c, out, n, { gain: 0.9, decay: 0.2, filter: [hp(1100), lp(9500)] });
    },
  },
  {
    id: 'rim', label: 'Rim / aro', short: 'RM', group: 'kit', length: 0.1, level: 0.8, instrument: true,
    build: (c, out, n) => {
      tone(c, out, { type: 'triangle', f0: 520, decay: 0.035, gain: 0.8 });
      tone(c, out, { f0: 1720, decay: 0.02, gain: 0.45 });
      noise(c, out, n, { gain: 0.8, decay: 0.035, filter: [bp(1900, 3)] });
    },
  },
  {
    id: 'clap', label: 'Palmada', short: 'PA', group: 'kit', length: 0.3, level: 0.8, instrument: true,
    build: (c, out, n) => {
      for (const d of [0, 0.011, 0.023]) noise(c, out, n, { gain: 0.9, decay: 0.01, delay: d, filter: [bp(1150, 0.9)] });
      noise(c, out, n, { gain: 0.7, decay: 0.16, delay: 0.031, filter: [bp(1250, 0.8)] });
    },
  },
  {
    id: 'hhc', label: 'Hi-hat cerrado', short: 'HH', group: 'kit', length: 0.12, level: 0.6, instrument: true,
    build: (c, out, n) => {
      metal(c, out, { gain: 0.9, decay: 0.05, hp: 7000, bp: 10000 });
      noise(c, out, n, { gain: 0.35, decay: 0.035, filter: [hp(8500)] });
    },
  },
  {
    id: 'hho', label: 'Hi-hat abierto', short: 'HA', group: 'kit', length: 0.7, level: 0.55, instrument: true,
    build: (c, out, n) => {
      metal(c, out, { gain: 0.9, decay: 0.45, hp: 7000, bp: 10000 });
      noise(c, out, n, { gain: 0.3, decay: 0.38, filter: [hp(8000)] });
    },
  },
  {
    id: 'hhp', label: 'Hi-hat pedal', short: 'HP', group: 'kit', length: 0.1, level: 0.45, instrument: true,
    build: (c, out, n) => {
      metal(c, out, { gain: 0.8, decay: 0.035, hp: 5500, bp: 8500, attack: 0.004 });
      noise(c, out, n, { gain: 0.25, decay: 0.03, attack: 0.004, filter: [bp(6000, 1)] });
    },
  },
  {
    id: 'ride', label: 'Ride', short: 'RI', group: 'kit', length: 1.6, level: 0.5, instrument: true,
    build: (c, out, n) => {
      metal(c, out, { base: 52, gain: 0.8, decay: 1.4, hp: 3200, bp: 6200 });
      noise(c, out, n, { gain: 0.5, decay: 0.05, filter: [bp(8200, 2)] });
      tone(c, out, { f0: 2960, decay: 0.7, gain: 0.07 });
      tone(c, out, { f0: 4410, decay: 0.4, gain: 0.04 });
    },
  },
  {
    id: 'crash', label: 'Crash', short: 'CR', group: 'kit', length: 2, level: 0.55, instrument: true,
    build: (c, out, n) => {
      noise(c, out, n, { gain: 0.9, decay: 1.8, attack: 0.002, filter: [hp(3400)] });
      metal(c, out, { base: 47, gain: 0.5, decay: 1.3, hp: 4000, bp: 7500, attack: 0.002 });
    },
  },
  {
    id: 'tomH', label: 'Tom agudo', short: 'T1', group: 'kit', length: 0.5, level: 0.85, instrument: true,
    build: (c, out, n) => {
      tone(c, out, { f0: 270, f1: 195, sweep: 0.16, decay: 0.38 });
      noise(c, out, n, { gain: 0.2, decay: 0.02, filter: [bp(1500, 1)] });
    },
  },
  {
    id: 'tomM', label: 'Tom medio', short: 'T2', group: 'kit', length: 0.55, level: 0.85, instrument: true,
    build: (c, out, n) => {
      tone(c, out, { f0: 200, f1: 145, sweep: 0.18, decay: 0.44 });
      noise(c, out, n, { gain: 0.2, decay: 0.02, filter: [bp(1200, 1)] });
    },
  },
  {
    id: 'tomF', label: 'Tom base', short: 'TB', group: 'kit', length: 0.7, level: 0.9, instrument: true,
    build: (c, out, n) => {
      tone(c, out, { f0: 125, f1: 86, sweep: 0.22, decay: 0.58 });
      noise(c, out, n, { gain: 0.2, decay: 0.02, filter: [bp(900, 1)] });
    },
  },
  // --- Percusión ---
  {
    id: 'cowbell', label: 'Cencerro', short: 'CE', group: 'perc', length: 0.4, level: 0.6, instrument: true,
    build: (c, out) => {
      const mix = c.createGain();
      for (const f of [545, 815]) {
        const o = c.createOscillator();
        o.type = 'square';
        o.frequency.value = f;
        o.connect(mix);
        o.start(0);
        o.stop(0.4);
      }
      const env = envelope(c, 0.5, 0.001, 0.3, 0);
      chain(c, mix, [bp(820, 1.4)]).connect(env);
      env.connect(out);
    },
  },
  {
    id: 'clave', label: 'Clave', short: 'CV', group: 'perc', length: 0.1, level: 0.85, instrument: true,
    build: (c, out) => {
      tone(c, out, { f0: 2480, decay: 0.05 });
      tone(c, out, { f0: 4960, decay: 0.012, gain: 0.2 });
    },
  },
  {
    id: 'congaH', label: 'Conga', short: 'CG', group: 'perc', length: 0.3, level: 0.85, instrument: true,
    build: (c, out, n) => {
      tone(c, out, { f0: 390, f1: 345, sweep: 0.03, decay: 0.19 });
      noise(c, out, n, { gain: 0.3, decay: 0.006, filter: [bp(3000, 1)] });
    },
  },
  {
    id: 'congaL', label: 'Tumba', short: 'TU', group: 'perc', length: 0.35, level: 0.85, instrument: true,
    build: (c, out, n) => {
      tone(c, out, { f0: 265, f1: 232, sweep: 0.035, decay: 0.24 });
      noise(c, out, n, { gain: 0.3, decay: 0.006, filter: [bp(2500, 1)] });
    },
  },
  {
    id: 'shaker', label: 'Shaker', short: 'SH', group: 'perc', length: 0.12, level: 0.45, instrument: true,
    build: (c, out, n) => noise(c, out, n, { gain: 0.9, attack: 0.012, decay: 0.06, filter: [bp(7000, 0.8), hp(4000)] }),
  },
];

export const SOUND_MAP = new Map(SOUNDS.map((s) => [s.id, s]));
export const INSTRUMENTS = SOUNDS.filter((s) => s.instrument);
export const DEFAULT_ROWS = ['kick', 'snare', 'hhc', 'hho', 'ride', 'crash', 'tomH', 'tomF'];

export const GROUP_LABELS: Record<SoundGroup, string> = {
  click: 'Clicks',
  kit: 'Batería',
  perc: 'Percusión',
};

export const soundLabel = (id: string): string => SOUND_MAP.get(id)?.label ?? id;
export const soundShort = (id: string): string => SOUND_MAP.get(id)?.short ?? id.slice(0, 2).toUpperCase();

/** Ruido blanco determinista para que los sonidos sean idénticos en cada carga. */
function makeNoise(c: BaseAudioContext): AudioBuffer {
  const buf = c.createBuffer(1, Math.ceil(c.sampleRate * 2.5), c.sampleRate);
  const data = buf.getChannelData(0);
  let seed = 0x2f6b1d;
  for (let i = 0; i < data.length; i++) {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    data[i] = ((seed >>> 0) / 0xffffffff) * 2 - 1;
  }
  return buf;
}

export async function renderSound(def: SoundDef, sampleRate: number): Promise<AudioBuffer> {
  const length = Math.ceil(def.length * sampleRate);
  const off = new OfflineAudioContext(1, length, sampleRate);
  def.build(off, off.destination, makeNoise(off));
  const buf = await off.startRendering();
  const data = buf.getChannelData(0);
  let peak = 0;
  for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i]));
  const k = peak > 0 ? (0.9 / peak) * def.level : 1;
  // Normaliza y garantiza que el final del buffer llegue a cero (sin clicks al cortar).
  const fade = Math.min(data.length, Math.ceil(sampleRate * 0.004));
  for (let i = 0; i < data.length; i++) {
    const tail = data.length - i;
    data[i] *= tail < fade ? k * (tail / fade) : k;
  }
  return buf;
}
