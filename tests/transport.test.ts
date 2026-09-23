import { describe, expect, it } from 'vitest';
import { Transport, type ScheduledEvent, type TransportSource } from '../src/audio/transport';
import type { Timer } from '../src/audio/timer';
import { planBar, timerLimit } from '../src/core/practice';
import { defaultState } from '../src/core/store';
import type { PlayMode } from '../src/core/types';
import type { EndReason } from '../src/core/practice';

/** Simula el reloj de audio y un temporizador con jitter para comprobar precisión y sincronía. */
function simulate(opts: {
  mode: PlayMode; seconds: number; bpm?: number | ((t: number) => number); pulses?: number;
  sub?: number; spb?: number; bars?: number; swing?: number; click?: boolean; loop?: boolean;
  practice?: ReturnType<typeof defaultState>['practice']; stall?: [number, number];
  poly?: number[]; polyBars?: number;
}) {
  let now = 0;
  let bpm = typeof opts.bpm === 'number' ? opts.bpm : typeof opts.bpm === 'function' ? opts.bpm(0) : 120;
  const played: ScheduledEvent[] = [];
  const tempos: number[] = [];
  let ended: EndReason | null = null;
  const timer: Timer = { start() {}, stop() {} };
  const src: TransportSource = {
    bpm: () => bpm,
    pulses: () => opts.pulses ?? 4,
    metSub: () => opts.sub ?? 1,
    subAllowed: (n) => [1, 2, 3, 4, 5, 6, 8].includes(n),
    beatSpb: () => opts.spb ?? 4,
    beatBars: () => opts.bars ?? 1,
    swing: () => ({ amount: opts.swing ?? 0.5, unit: 2, compound: false }),
    clickWithBeat: () => opts.click ?? false,
    loop: () => opts.loop ?? true,
    planBar: (bar, elapsed) => planBar(opts.practice ?? defaultState().practice, 100, bar, elapsed),
    limit: () => timerLimit((opts.practice ?? defaultState().practice).timer),
    poly: () => opts.poly ?? [],
    polyBars: () => opts.polyBars ?? 1,
    playMet: (e) => played.push(e),
    playBeat: (e) => played.push(e),
    playPoly: (e) => played.push(e),
  };
  void tempos;
  const tr = new Transport({ now: () => now }, timer, src, {
    onEvent: () => {},
    onTempo: (b) => { bpm = b; tempos.push(b); },
    onEnd: (r) => (ended = r),
  });
  tr.start(opts.mode);
  let seed = 7;
  const drain = () => { /* los eventos 'end' se cierran con setTimeout */ };
  void drain;
  while (now < opts.seconds) {
    seed = (seed * 16807) % 2147483647;
    now += 0.025 + (seed / 2147483647) * 0.02; // 25–45 ms de jitter
    if (opts.stall && now > opts.stall[0] && now < opts.stall[0] + 0.001 + 0.045) now += opts.stall[1];
    if (typeof opts.bpm === 'function') bpm = opts.bpm(now);
    tr.tick();
  }
  return { played, tempos, ended, tr, pulses: played.filter((e) => e.kind === 'pulse') };
}

describe('transporte', () => {
  it('no deriva: tras 10 minutos a 137 BPM cada click cae en su sitio exacto', () => {
    const { played } = simulate({ mode: 'metronome', seconds: 600, bpm: 137 });
    const start = played[0].time;
    const dur = 60 / 137;
    expect(played.length).toBeGreaterThan(1360);
    played.forEach((e, i) => expect(Math.abs(e.time - start - i * dur)).toBeLessThan(1e-9));
  });

  it('no duplica ni salta pasos pese al jitter', () => {
    const { played } = simulate({ mode: 'metronome', seconds: 120, bpm: 240, sub: 4 });
    played.forEach((e, i) => {
      expect(e.step).toBe(i % 16);
      if (i) expect(e.time).toBeGreaterThan(played[i - 1].time);
    });
  });

  it('click y beat comparten exactamente los mismos instantes', () => {
    const { played } = simulate({ mode: 'beat', seconds: 60, bpm: 93, sub: 2, spb: 4, click: true, swing: 0.62 });
    const met = played.filter((e) => e.kind === 'met');
    const beat = played.filter((e) => e.kind === 'beat');
    expect(met.length).toBeGreaterThan(100);
    // Cada click (corcheas) coincide con la semicorchea par del beat
    for (const m of met) {
      const match = beat.find((b) => b.bar === m.bar && b.pulse === m.pulse && b.step % 4 === (m.step % 2) * 2);
      expect(match, `click ${m.bar}.${m.step}`).toBeDefined();
      expect(Math.abs(match!.time - m.time)).toBeLessThan(1e-12);
    }
  });

  it('el patrón del beat avanza cíclicamente por todos los compases', () => {
    const { played } = simulate({ mode: 'beat', seconds: 30, bpm: 120, spb: 2, bars: 2 });
    played.forEach((e, i) => expect(e.step).toBe(i % 16));
  });

  it('los cambios de tempo entran en el siguiente pulso sin saltos', () => {
    const { played } = simulate({ mode: 'metronome', seconds: 20, bpm: (t) => (t < 10 ? 60 : 180) });
    const gaps = played.slice(1).map((e, i) => +(e.time - played[i].time).toFixed(9));
    expect(new Set(gaps)).toEqual(new Set([1, 1 / 3].map((x) => +x.toFixed(9))));
    expect(gaps.indexOf(+(1 / 3).toFixed(9))).toBe(gaps.lastIndexOf(1) + 1);
  });

  it('aplica la rampa de tempo del modo práctica en cada compás', () => {
    const practice = defaultState().practice;
    practice.ramp = { ...practice.ramp, on: true, mode: 'step', everyBars: 1, step: 10, target: 130 };
    const { played } = simulate({ mode: 'metronome', seconds: 20, practice });
    const firstOfBar = (b: number) => played.find((e) => e.bar === b)!;
    const barLen = (b: number) => firstOfBar(b + 1).time - firstOfBar(b).time;
    expect(barLen(0)).toBeCloseTo(4 * 0.6);
    expect(barLen(1)).toBeCloseTo((4 * 60) / 110);
    expect(barLen(5)).toBeCloseTo((4 * 60) / 130);
  });

  it('para al final de una secuencia sin repetición', () => {
    const practice = defaultState().practice;
    practice.sequence = { on: true, repeats: 1, blocks: [{ bars: 2, bpm: 0, mode: 'full', sub: 0 }, { bars: 1, bpm: 0, mode: 'silent', sub: 0 }] };
    const { played } = simulate({ mode: 'metronome', seconds: 10, bpm: 120, practice });
    const met = played.filter((e) => e.kind === 'met');
    expect(met.length).toBe(12);
    expect(met.slice(8).every((e) => e.mode === 'silent')).toBe(true);
  });

  it('se recoloca sin ráfagas tras un bloqueo del hilo', () => {
    const { played } = simulate({ mode: 'metronome', seconds: 20, bpm: 120, stall: [5, 2] });
    const gaps = played.slice(1).map((e, i) => e.time - played[i].time);
    expect(Math.min(...gaps)).toBeGreaterThan(0.49);
  });

  it('polirritmias exactas: 3, 4 y 5 golpes contra 4 pulsos, sin deriva', () => {
    const { played } = simulate({ mode: 'metronome', seconds: 300, bpm: 97, poly: [3, 5, 7], polyBars: 1 });
    const met = played.filter((e) => e.kind === 'met');
    const cycleStarts = met.filter((e) => e.step === 0).map((e) => e.time);
    const barDur = (4 * 60) / 97;
    for (const [layer, n] of [[0, 3], [1, 5], [2, 7]] as const) {
      const hits = played.filter((e) => e.kind === 'poly' && e.layer === layer);
      // Cada golpe cae en k/n del compás, con error de redondeo despreciable
      for (const hit of hits) {
        const bar = cycleStarts[hit.bar];
        expect(Math.abs(hit.time - (bar + (hit.step / n) * barDur))).toBeLessThan(1e-9);
      }
      // n golpes por compás completo, sin huecos ni duplicados
      const perBar = new Map<number, number[]>();
      for (const hit of hits) perBar.set(hit.bar, [...(perBar.get(hit.bar) ?? []), hit.step]);
      for (const [bar, steps] of perBar) if (bar > 0 && bar < cycleStarts.length - 2) expect(steps).toEqual([...Array(n).keys()]);
      // El primer golpe de cada capa coincide exactamente con el 1 del metrónomo
      for (const hit of hits.filter((h) => h.step === 0)) expect(hit.time).toBe(cycleStarts[hit.bar]);
    }
  });

  it('polirritmia con ciclo de 2 compases', () => {
    const { played } = simulate({ mode: 'metronome', seconds: 20, bpm: 120, poly: [3], polyBars: 2 });
    const hits = played.filter((e) => e.kind === 'poly');
    const gaps = new Set(hits.slice(1).map((e, i) => +(e.time - hits[i].time).toFixed(9)));
    expect(gaps).toEqual(new Set([+(8 * 0.5 / 3).toFixed(9)]));
  });

  it('el temporizador para por tiempo o por compases', () => {
    const byTime = defaultState().practice;
    byTime.timer = { on: true, by: 'time', seconds: 10, bars: 0 };
    const a = simulate({ mode: 'metronome', seconds: 30, bpm: 120, practice: byTime });
    expect(a.played.filter((e) => e.kind === 'met').length).toBe(20);
    const byBars = defaultState().practice;
    byBars.timer = { on: true, by: 'bars', seconds: 0, bars: 3 };
    const b = simulate({ mode: 'beat', seconds: 30, bpm: 120, spb: 2, practice: byBars });
    expect(b.played.length).toBe(3 * 4 * 2);
  });

  it('los bloques de la secuencia pueden cambiar la subdivisión', () => {
    const practice = defaultState().practice;
    practice.sequence = { on: true, repeats: 0, blocks: [{ bars: 1, bpm: 0, mode: 'full', sub: 1 }, { bars: 1, bpm: 0, mode: 'full', sub: 3 }] };
    const { played } = simulate({ mode: 'metronome', seconds: 8, bpm: 120, sub: 2, practice });
    const byBar = (b: number) => played.filter((e) => e.bar === b);
    expect(byBar(0).length).toBe(4);
    expect(byBar(1).length).toBe(12);
    expect(byBar(1).every((e) => e.sub === 3)).toBe(true);
  });

  it('el silencio del beat solo se aplica si se pide', () => {
    const practice = defaultState().practice;
    practice.gap = { ...practice.gap, on: true, playBars: 1, muteBars: 1, what: 'click' };
    const a = simulate({ mode: 'beat', seconds: 8, bpm: 120, spb: 2, click: true, practice });
    expect(a.played.filter((e) => e.kind === 'beat' && e.bar === 1).every((e) => e.mode === 'full')).toBe(true);
    expect(a.played.filter((e) => e.kind === 'met' && e.bar === 1).every((e) => e.mode === 'silent')).toBe(true);
    practice.gap.what = 'all';
    const b = simulate({ mode: 'beat', seconds: 8, bpm: 120, spb: 2, click: true, practice });
    expect(b.played.filter((e) => e.kind === 'beat' && e.bar === 1).every((e) => e.mode === 'silent')).toBe(true);
  });

  it('pausa y reanuda desde el primer pulso no sonado', () => {
    let now = 0;
    const played: ScheduledEvent[] = [];
    const src = {
      bpm: () => 120, pulses: () => 4, metSub: () => 1, subAllowed: () => true, beatSpb: () => 1, beatBars: () => 1,
      limit: () => ({ bars: 0, seconds: 0 }), poly: () => [], polyBars: () => 1, playPoly: () => {},
      swing: () => ({ amount: 0.5, unit: 2, compound: false }), clickWithBeat: () => false, loop: () => true,
      planBar: () => ({ bpm: null, mode: 'full' as const, muteBeat: false, sub: 0, block: -1, stop: null }),
      playMet: (e: ScheduledEvent) => played.push(e), playBeat: () => {},
    };
    const tr = new Transport({ now: () => now }, { start() {}, stop() {} }, src, { onEvent() {}, onTempo() {}, onEnd() {} });
    tr.start('metronome');
    for (; now < 1.3; now += 0.02) tr.tick();
    const resumeAt = tr.pause();
    expect(resumeAt.pulse).toBe(3);
    expect(resumeAt.elapsed).toBeCloseTo(1.5);
    tr.start('metronome', resumeAt);
    tr.tick();
    expect(played[played.length - 1].step).toBe(3);
  });
});
