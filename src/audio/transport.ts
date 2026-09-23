import type { BarPlan, EndReason } from '../core/practice';
import type { ClickMode, PlayMode } from '../core/types';
import { stepFraction, type SwingInfo } from './timing';
import type { Timer } from './timer';

export type EventKind = 'met' | 'beat' | 'poly' | 'pulse' | 'end';

export interface ScheduledEvent {
  kind: EventKind;
  /** Tiempo en segundos del AudioContext */
  time: number;
  /**
   * met: paso dentro del compás · beat: paso dentro del patrón ·
   * poly: golpe dentro del ciclo · pulse: pulso absoluto desde el inicio
   */
  step: number;
  /** Divisiones usadas: pasos por pulso (met/beat) o golpes por ciclo (poly) */
  sub: number;
  pulses: number;
  /** Pulso dentro del compás y compás absoluto desde el inicio */
  pulse: number;
  bar: number;
  mode: ClickMode;
  /** Duración del pulso y segundos transcurridos al empezar el pulso */
  dur: number;
  elapsed: number;
  /** Capa de polirritmia */
  layer: number;
  /** Bloque de secuencia activo (-1 si no hay) */
  block: number;
  reason?: EndReason;
}

export interface TransportSource {
  bpm(): number;
  pulses(): number;
  metSub(): number;
  /** ¿Es válida esta subdivisión para el compás activo? */
  subAllowed(sub: number): boolean;
  beatSpb(): number;
  beatBars(): number;
  swing(): SwingInfo;
  clickWithBeat(): boolean;
  loop(): boolean;
  planBar(bar: number, elapsed: number): BarPlan;
  /** Límite del temporizador (0 = sin límite) */
  limit(): { bars: number; seconds: number };
  /** Capas de polirritmia (golpes por ciclo) y longitud del ciclo en compases */
  poly(): number[];
  polyBars(): number;
  playMet(ev: ScheduledEvent): void;
  playBeat(ev: ScheduledEvent): void;
  playPoly(ev: ScheduledEvent): void;
}

export interface TransportHooks {
  onEvent(ev: ScheduledEvent): void;
  onTempo(bpm: number): void;
  onEnd(reason: EndReason): void;
}

export interface Clock {
  now(): number;
}

/**
 * Planificador de "dos relojes" (look-ahead scheduling):
 * un temporizador impreciso despierta cada ~25 ms y programa en el reloj
 * del AudioContext todo lo que cae en la ventana siguiente.
 *
 * Todo se calcula a partir de un único contador de pulsos, así que el click,
 * el beat y las polirritmias nunca pueden desincronizarse entre sí. El tiempo de
 * cada pulso se obtiene sumando la duración del anterior, con lo que un cambio
 * de tempo entra en el siguiente pulso sin saltos.
 */
export class Transport {
  lookahead = 0.12;
  readonly intervalMs = 25;
  mode: PlayMode = 'metronome';
  running = false;

  private pulse = 0;
  private elapsed = 0;
  private nextTime = 0;
  private pending: ScheduledEvent[] = [];
  private starts: { pulse: number; time: number; elapsed: number }[] = [];
  private plan: BarPlan = { bpm: null, mode: 'full', muteBeat: false, sub: 0, block: -1, stop: null };
  private needPlan = true;
  private halted = false;
  private endTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly clock: Clock,
    private readonly timer: Timer,
    private readonly src: TransportSource,
    private readonly hooks: TransportHooks,
  ) {}

  get position(): { pulse: number; elapsed: number } {
    return { pulse: this.pulse, elapsed: this.elapsed };
  }

  start(mode: PlayMode, from: { pulse: number; elapsed: number } = { pulse: 0, elapsed: 0 }): void {
    this.halt();
    this.mode = mode;
    this.pulse = from.pulse;
    this.elapsed = from.elapsed;
    this.needPlan = true;
    this.halted = false;
    this.nextTime = this.clock.now() + 0.06;
    this.running = true;
    this.timer.start(() => this.tick(), this.intervalMs);
    this.tick();
  }

  /** Detiene y devuelve la posición del primer pulso que aún no había sonado. */
  pause(): { pulse: number; elapsed: number } {
    const now = this.clock.now();
    const next = this.starts.find((s) => s.time > now);
    const at = next ? { pulse: next.pulse, elapsed: next.elapsed } : { pulse: this.pulse, elapsed: this.elapsed };
    this.halt();
    this.pulse = at.pulse;
    this.elapsed = at.elapsed;
    return at;
  }

  stop(): void {
    this.halt();
    this.pulse = 0;
    this.elapsed = 0;
  }

  tick(): void {
    if (!this.running) return;
    const now = this.clock.now();
    // Si el hilo principal estuvo bloqueado o la pestaña suspendida, se recoloca sin ráfagas.
    if (this.nextTime < now - 0.08) {
      this.nextTime = now + 0.03;
      this.pending = this.pending.filter((e) => e.kind === 'end');
    }
    const horizon = now + this.lookahead;
    while (!this.halted && this.nextTime < horizon) this.preparePulse();
    this.flush(horizon, now);
  }

  private halt(): void {
    this.timer.stop();
    this.running = false;
    this.pending = [];
    this.starts = [];
    if (this.endTimer !== null) clearTimeout(this.endTimer);
    this.endTimer = null;
  }

  private end(reason: EndReason, t: number, bar: number, ppb: number): void {
    this.halted = true;
    this.pending.push({
      kind: 'end', time: t, step: 0, sub: 1, pulses: ppb, pulse: 0, bar, mode: 'silent',
      dur: 0, elapsed: this.elapsed, layer: -1, block: -1, reason,
    });
  }

  private preparePulse(): void {
    const p = this.pulse;
    const t = this.nextTime;
    const ppb = Math.max(1, this.src.pulses());
    const bar = Math.floor(p / ppb);
    const inBar = p % ppb;

    const lim = this.src.limit();
    if ((lim.bars > 0 && inBar === 0 && bar >= lim.bars) || (lim.seconds > 0 && this.elapsed >= lim.seconds - 1e-6)) {
      this.end('timer', t, bar, ppb);
      return;
    }

    if (inBar === 0 || this.needPlan) {
      const plan = this.src.planBar(bar, this.elapsed);
      const patternDone = this.mode === 'beat' && !this.src.loop() && bar >= this.src.beatBars();
      if (inBar === 0 && (plan.stop || patternDone)) {
        this.end(plan.stop ?? 'pattern', t, bar, ppb);
        return;
      }
      this.needPlan = false;
      if (plan.bpm !== null) this.hooks.onTempo(plan.bpm);
      this.plan = plan;
    }

    const dur = 60 / this.src.bpm();
    const sw = this.src.swing();
    const base = {
      pulses: ppb, pulse: inBar, bar, mode: this.plan.mode, dur, elapsed: this.elapsed,
      layer: -1, block: this.plan.block,
    };

    this.pending.push({ ...base, kind: 'pulse', time: t, step: p, sub: 1 });

    if (this.mode === 'metronome' || this.src.clickWithBeat()) {
      const forced = this.plan.sub > 0 && this.src.subAllowed(this.plan.sub) ? this.plan.sub : 0;
      const sub = Math.max(1, forced || this.src.metSub());
      for (let s = 0; s < sub; s++) {
        this.pending.push({ ...base, kind: 'met', time: t + dur * stepFraction(s, sub, sw), step: inBar * sub + s, sub });
      }
    }

    if (this.mode === 'metronome') {
      const layers = this.src.poly();
      if (layers.length) {
        // Ciclo de C pulsos; la capa i da n golpes iguales. Aritmética entera: sin error acumulado.
        const C = ppb * Math.max(1, this.src.polyBars());
        const q = p % C;
        layers.forEach((n, layer) => {
          if (n < 1) return;
          const k0 = Math.floor((q * n + C - 1) / C);
          const k1 = Math.floor(((q + 1) * n + C - 1) / C);
          for (let k = k0; k < k1; k++) {
            this.pending.push({ ...base, kind: 'poly', layer, time: t + (dur * (k * C - q * n)) / n, step: k, sub: n });
          }
        });
      }
    }

    if (this.mode === 'beat') {
      const spb = Math.max(1, this.src.beatSpb());
      const bars = Math.max(1, this.src.beatBars());
      const patPulse = p % (ppb * bars);
      const mode: ClickMode = this.plan.muteBeat ? 'silent' : 'full';
      for (let s = 0; s < spb; s++) {
        this.pending.push({
          ...base, mode, kind: 'beat', time: t + dur * stepFraction(s, spb, sw), step: patPulse * spb + s, sub: spb,
        });
      }
    }

    this.starts.push({ pulse: p, time: t, elapsed: this.elapsed });
    if (this.starts.length > 32) this.starts.shift();
    this.pulse = p + 1;
    this.elapsed += dur;
    this.nextTime = t + dur;
  }

  private flush(horizon: number, now: number): void {
    const ready: ScheduledEvent[] = [];
    const rest: ScheduledEvent[] = [];
    for (const e of this.pending) (e.time < horizon ? ready : rest).push(e);
    this.pending = rest;
    ready.sort((a, b) => a.time - b.time);
    for (const e of ready) {
      if (e.kind === 'end') {
        const reason = e.reason ?? 'pattern';
        this.endTimer = setTimeout(
          () => {
            this.stop();
            this.hooks.onEnd(reason);
          },
          Math.max(0, (e.time - now) * 1000),
        );
        continue;
      }
      if (e.time < now - 0.03) continue;
      if (e.kind === 'met') this.src.playMet(e);
      else if (e.kind === 'beat') this.src.playBeat(e);
      else if (e.kind === 'poly') this.src.playPoly(e);
      this.hooks.onEvent(e);
    }
  }
}
