/** 0 = silencio, 1 = suave / ghost, 2 = normal, 3 = acento */
export type Level = 0 | 1 | 2 | 3;
export type SoundId = string;
export type InstrumentId = string;

export interface Meter {
  num: number;
  den: number;
}

export interface MetStep {
  level: Level;
  /** Sonido específico para este paso. Sin definir = el sonido asignado a su nivel. */
  sound?: SoundId;
}

export interface Swing {
  /** 0.5 = recto, 0.75 = máximo */
  amount: number;
  /** Resolución a la que se aplica: 2 = corcheas, 4 = semicorcheas (en compases simples). */
  unit: 2 | 4;
}

export interface PolyLayer {
  id: string;
  /** Golpes regulares por ciclo */
  n: number;
  sound: SoundId;
  vol: number;
  mute: boolean;
  /** Acentuar el primer golpe del ciclo */
  accent: boolean;
}

export interface PolyState {
  on: boolean;
  /** Duración del ciclo en compases */
  cycleBars: number;
  layers: PolyLayer[];
}

export interface MetronomeState {
  subdivision: number;
  steps: MetStep[];
  sounds: { accent: SoundId; beat: SoundId; sub: SoundId };
  swing: Swing;
  poly: PolyState;
}

export interface BeatPattern {
  stepsPerBeat: number;
  bars: number;
  swing: Swing;
  /** Una pista por instrumento; longitud = pulsos × pasos por pulso × compases. */
  tracks: Record<InstrumentId, Level[]>;
}

export interface Groove {
  id: string;
  name: string;
  style: string;
  bpm: number;
  meter: Meter;
  pattern: BeatPattern;
  builtin?: boolean;
  notes?: string;
  /** 1 básico, 2 intermedio, 3 avanzado */
  level?: 1 | 2 | 3;
}

export interface EditorState {
  /** id del groove de usuario que se está editando (null = sin guardar o copia de uno incluido) */
  grooveId: string | null;
  name: string;
  style: string;
  meter: Meter;
  pattern: BeatPattern;
  visible: InstrumentId[];
}

export type ClickMode = 'full' | 'beats' | 'downbeat' | 'silent';

export interface SeqBlock {
  bars: number;
  /** 0 = mantener el BPM actual */
  bpm: number;
  mode: ClickMode;
  /** Clicks por pulso durante el bloque; 0 = los del metrónomo */
  sub: number;
}

export type RampMode = 'step' | 'bars' | 'time';
export type RampAfter = 'hold' | 'restart' | 'stop';

export interface RampState {
  on: boolean;
  mode: RampMode;
  /** BPM inicial; 0 = el tempo actual al pulsar play */
  from: number;
  target: number;
  /** Modo por pasos: cada `everyBars` compases cambia `step` BPM */
  everyBars: number;
  step: number;
  /** Modo compases: compases hasta llegar al objetivo */
  bars: number;
  /** Modo tiempo: segundos hasta llegar al objetivo */
  seconds: number;
  after: RampAfter;
  /** Tiempo en el objetivo antes de repetir o parar (compases, o segundos en modo tiempo) */
  hold: number;
}

export interface GapState {
  on: boolean;
  random: boolean;
  playBars: number;
  muteBars: number;
  /** Probabilidad (%) de silencio por compás en modo aleatorio */
  chance: number;
  what: 'click' | 'all';
}

export interface TimerState {
  on: boolean;
  by: 'time' | 'bars';
  seconds: number;
  bars: number;
}

export interface PracticeState {
  /** Qué suena al pulsar play desde la pestaña Práctica */
  source: PlayMode;
  ramp: RampState;
  gap: GapState;
  sequence: { on: boolean; repeats: number; blocks: SeqBlock[] };
  timer: TimerState;
}

export type Action = 'playPause' | 'bpmUp' | 'bpmDown' | 'tap' | 'reset';
export type Tab = 'metronome' | 'beat' | 'grooves' | 'practice' | 'settings';
export type PlayMode = 'metronome' | 'beat';

export interface MixChannel {
  vol: number;
  mute: boolean;
}

export interface Settings {
  theme: 'dark' | 'light';
  flash: boolean;
  wakeLock: boolean;
  visualOffsetMs: number;
  keys: Record<Action, string>;
}

export interface AppState {
  version: number;
  tab: Tab;
  bpm: number;
  meter: Meter;
  metronome: MetronomeState;
  editor: EditorState;
  beatClick: boolean;
  loop: boolean;
  mixer: Record<InstrumentId, MixChannel>;
  volumes: { master: number; metronome: number; beat: number };
  practice: PracticeState;
  library: { user: Groove[]; favorites: string[] };
  settings: Settings;
}
