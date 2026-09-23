import { describe, expect, it } from 'vitest';
import { swingWarp, stepFraction } from '../src/audio/timing';
import { countLabels, groupings, isCompound, pulsesPerBar, subdivisionLabel, clampBpm, parseMeter } from '../src/core/meter';
import { defaultMetSteps, groupingSteps, metPreset, parseTrack, remapMetSteps, resizePattern, trackToString, nextMetLevel } from '../src/core/patterns';
import { formatClock, formatDuration, planBar, planRamp, rampEstimate, sequenceEstimate, timerLimit } from '../src/core/practice';
import { TapTempo } from '../src/core/tapTempo';
import { BUILTIN_GROOVES } from '../src/data/grooves';
import { defaultState, hydrate, sanitizeGroove } from '../src/core/store';
import type { PracticeState } from '../src/core/types';

describe('compás', () => {
  it('distingue compases compuestos', () => {
    expect(isCompound({ num: 6, den: 8 })).toBe(true);
    expect(isCompound({ num: 12, den: 8 })).toBe(true);
    expect(isCompound({ num: 3, den: 8 })).toBe(false);
    expect(isCompound({ num: 7, den: 8 })).toBe(false);
    expect(pulsesPerBar({ num: 12, den: 8 })).toBe(4);
    expect(pulsesPerBar({ num: 7, den: 8 })).toBe(7);
  });
  it('etiqueta subdivisiones y conteo', () => {
    expect(subdivisionLabel({ num: 4, den: 4 }, 2)).toBe('Corcheas');
    expect(subdivisionLabel({ num: 4, den: 4 }, 4)).toBe('Semicorcheas');
    expect(subdivisionLabel({ num: 6, den: 8 }, 3)).toBe('Corcheas');
    expect(countLabels({ num: 2, den: 4 }, 4)).toEqual(['1', 'e', '&', 'a', '2', 'e', '&', 'a']);
  });
  it('limita el BPM y parsea compases', () => {
    expect(clampBpm(5)).toBe(20);
    expect(clampBpm(999)).toBe(320);
    expect(clampBpm(NaN)).toBe(120);
    expect(parseMeter('7/8')).toEqual({ num: 7, den: 8 });
    expect(parseMeter('4/3')).toEqual({ num: 4, den: 4 });
  });
});

describe('swing', () => {
  it('no mueve nada con swing 50 %', () => {
    for (const f of [0, 0.25, 0.5, 0.75]) expect(swingWarp(f, 0.5, 2)).toBe(f);
  });
  it('desplaza la corchea débil', () => {
    expect(swingWarp(0.5, 0.66, 2)).toBeCloseTo(0.66);
    expect(swingWarp(0, 0.66, 2)).toBe(0);
  });
  it('en semicorcheas no mueve las corcheas', () => {
    expect(swingWarp(0.5, 0.7, 4)).toBeCloseTo(0.5);
    expect(swingWarp(0.25, 0.7, 4)).toBeCloseTo(0.35);
    expect(swingWarp(0.75, 0.7, 4)).toBeCloseTo(0.85);
  });
  it('no afecta a tresillos ni a compases compuestos', () => {
    expect(stepFraction(1, 3, { amount: 0.7, unit: 2, compound: false })).toBeCloseTo(1 / 3);
    expect(stepFraction(1, 2, { amount: 0.7, unit: 2, compound: true })).toBe(0.5);
  });
  it('es monótono', () => {
    let prev = -1;
    for (let i = 0; i < 8; i++) {
      const f = stepFraction(i, 8, { amount: 0.75, unit: 4, compound: false });
      expect(f).toBeGreaterThan(prev);
      expect(f).toBeLessThan(1);
      prev = f;
    }
  });
});

describe('patrones', () => {
  it('crea el patrón por defecto con acento en el 1', () => {
    const s = defaultMetSteps(4, 2);
    expect(s.map((x) => x.level)).toEqual([3, 1, 2, 1, 2, 1, 2, 1]);
  });
  it('conserva pasos al cambiar la subdivisión', () => {
    const s = defaultMetSteps(4, 1);
    s[2] = { level: 0 };
    s[1] = { level: 2, sound: 'snare' };
    const r = remapMetSteps(s, 4, 1, 4, 4);
    expect(r).toHaveLength(16);
    expect(r[8].level).toBe(0);
    expect(r[4]).toEqual({ level: 2, sound: 'snare' });
    expect(r[5].level).toBe(1);
  });
  it('agrupaciones de compases irregulares', () => {
    expect(groupings(7)).toEqual([[2, 2, 3], [2, 3, 2], [3, 2, 2]]);
    expect(groupings(5)).toEqual([[2, 3], [3, 2]]);
    expect(groupings(3)).toEqual([]);
    expect(groupingSteps([2, 2, 3], 1).map((x) => x.level)).toEqual([3, 1, 2, 1, 2, 1, 1]);
  });

  it('plantilla bombo-hihat-caja-hihat', () => {
    const s = metPreset('kit', 4, 1);
    expect(s.map((x) => x.sound)).toEqual(['kick', 'hhc', 'snare', 'hhc']);
  });
  it('ciclo de intensidad completo', () => {
    let l = nextMetLevel(0);
    const seen = [l];
    for (let i = 0; i < 3; i++) seen.push((l = nextMetLevel(l)));
    expect(seen).toEqual([2, 3, 1, 0]);
  });
  it('parsea y serializa pistas', () => {
    const t = parseTrack('X.x. g...|....');
    expect(t).toEqual([3, 0, 2, 0, 1, 0, 0, 0, 0, 0, 0, 0]);
    expect(trackToString(t, 8)).toBe('X.x.g...|....');
  });
  it('redimensiona conservando posiciones temporales', () => {
    const p = { stepsPerBeat: 2, bars: 1, swing: { amount: 0.5, unit: 2 as const }, tracks: { kick: parseTrack('x. .x x. ..') } };
    const up = resizePattern(p, 4, 4, 4, 2);
    expect(up.tracks.kick).toHaveLength(32);
    expect(up.tracks.kick.slice(0, 16)).toEqual(parseTrack('x... ..x. x... ....'));
    expect(up.tracks.kick.slice(16)).toEqual(up.tracks.kick.slice(0, 16));
    const down = resizePattern(p, 4, 3, 2, 1);
    expect(down.tracks.kick).toEqual(parseTrack('x. .x x.'));
  });
});

describe('tap tempo', () => {
  it('promedia intervalos', () => {
    const t = new TapTempo();
    expect(t.tap(0)).toBeNull();
    expect(t.tap(500)).toBeCloseTo(120);
    expect(t.tap(1000)).toBeCloseTo(120);
    expect(t.tap(1510)).toBeCloseTo(60000 / 503.33, 1);
  });
  it('reinicia tras una pausa o un cambio brusco', () => {
    const t = new TapTempo();
    t.tap(0); t.tap(500); t.tap(1000);
    expect(t.tap(5000)).toBeNull();
    expect(t.tap(5250)).toBeCloseTo(240);
    const u = new TapTempo();
    u.tap(0); u.tap(1000); u.tap(2000);
    expect(u.tap(2300)).toBeCloseTo(200);
  });
});

describe('modo práctica', () => {
  const base = (): PracticeState => defaultState().practice;
  const ramp = (patch: Partial<PracticeState['ramp']>) => {
    const p = base();
    p.ramp = { ...p.ramp, on: true, ...patch };
    return p;
  };

  it('rampa por pasos hasta el objetivo', () => {
    const p = ramp({ mode: 'step', everyBars: 2, step: 5, target: 110, after: 'hold' });
    expect([0, 1, 2, 3, 4, 10].map((b) => planBar(p, 100, b, 0).bpm)).toEqual([100, 100, 105, 105, 110, 110]);
  });

  it('rampa por pasos hacia abajo (la dirección la marca el objetivo)', () => {
    const p = ramp({ mode: 'step', everyBars: 1, step: 10, target: 80 });
    expect([0, 1, 2, 3].map((b) => planBar(p, 100, b, 0).bpm)).toEqual([100, 90, 80, 80]);
  });

  it('rampa en N compases, lineal', () => {
    const p = ramp({ mode: 'bars', bars: 10, target: 150 });
    expect([0, 5, 10, 20].map((b) => planBar(p, 100, b, 0).bpm)).toEqual([100, 125, 150, 150]);
  });

  it('rampa en un tiempo usa los segundos transcurridos', () => {
    const p = ramp({ mode: 'time', seconds: 60, target: 160 });
    expect([0, 30, 60, 90].map((e) => planBar(p, 100, 3, e).bpm)).toEqual([100, 130, 160, 160]);
  });

  it('al llegar puede repetir o parar', () => {
    const rep = ramp({ mode: 'bars', bars: 4, target: 120, after: 'restart', hold: 2 });
    expect([0, 4, 5, 6, 7].map((b) => planBar(rep, 100, b, 0).bpm)).toEqual([100, 120, 120, 100, 105]);
    const stop = ramp({ mode: 'bars', bars: 4, target: 120, after: 'stop', hold: 1 });
    expect(planBar(stop, 100, 4, 0).stop).toBeNull();
    expect(planBar(stop, 100, 5, 0).stop).toBe('ramp');
    expect(planRamp(stop.ramp, 100, 2, 0).progress).toBe(0.5);
  });

  it('estima cuánto tarda en llegar', () => {
    const r = ramp({ mode: 'bars', bars: 2, target: 120 }).ramp;
    const est = rampEstimate(r, 60, 4);
    expect(est.bars).toBe(2);
    expect(est.seconds).toBeCloseTo(4 * 60 / 60 + 4 * 60 / 90);
    const st = rampEstimate(ramp({ mode: 'step', everyBars: 4, step: 5, target: 120 }).ramp, 100, 4);
    expect(st.bars).toBe(16);
    const t = rampEstimate(ramp({ mode: 'time', seconds: 30, target: 60 }).ramp, 60, 4);
    expect(t).toEqual({ bars: 8, seconds: 30 });
  });

  it('silencios fijos', () => {
    const p = base();
    p.gap = { ...p.gap, on: true, playBars: 2, muteBars: 1, what: 'click' };
    expect([0, 1, 2, 3, 4, 5].map((b) => planBar(p, 100, b, 0).mode)).toEqual(['full', 'full', 'silent', 'full', 'full', 'silent']);
    expect(planBar(p, 100, 2, 0).muteBeat).toBe(false);
    p.gap.what = 'all';
    expect(planBar(p, 100, 2, 0).muteBeat).toBe(true);
  });

  it('silencios aleatorios: reproducibles y con la proporción pedida', () => {
    const p = base();
    p.gap = { ...p.gap, on: true, random: true, chance: 30, playBars: 4 };
    const run = (seed: number) => Array.from({ length: 2000 }, (_, b) => planBar(p, 100, b, 0, seed).mode === 'silent');
    const a = run(11);
    expect(run(11)).toEqual(a);
    expect(a.slice(0, 4).every((x) => !x)).toBe(true);
    const ratio = a.filter(Boolean).length / a.length;
    expect(ratio).toBeGreaterThan(0.25);
    expect(ratio).toBeLessThan(0.35);
    expect(run(12)).not.toEqual(a);
  });

  it('secuencia con repeticiones, subdivisión por bloque y prioridad', () => {
    const p = base();
    p.ramp = { ...p.ramp, on: true, mode: 'bars', bars: 2, target: 200 };
    p.sequence = {
      on: true,
      repeats: 2,
      blocks: [{ bars: 1, bpm: 80, mode: 'full', sub: 2 }, { bars: 2, bpm: 0, mode: 'silent', sub: 0 }],
    };
    expect(planBar(p, 100, 0, 0)).toEqual({ bpm: 80, mode: 'full', muteBeat: false, sub: 2, block: 0, stop: null });
    expect(planBar(p, 100, 2, 0)).toMatchObject({ bpm: null, mode: 'silent', muteBeat: true, block: 1 });
    expect(planBar(p, 100, 3, 0).block).toBe(0);
    expect(planBar(p, 100, 6, 0).stop).toBe('sequence');
    p.sequence.repeats = 0;
    expect(planBar(p, 100, 600, 0).stop).toBeNull();
    expect(sequenceEstimate(p.sequence.blocks, 120, 4)).toEqual({ bars: 3, seconds: 3 + 4 });
  });

  it('temporizador y formatos', () => {
    expect(timerLimit({ on: false, by: 'time', seconds: 60, bars: 4 })).toEqual({ bars: 0, seconds: 0 });
    expect(timerLimit({ on: true, by: 'bars', seconds: 60, bars: 10 })).toEqual({ bars: 10, seconds: 0 });
    expect(formatClock(605)).toBe('10:05');
    expect(formatDuration(170)).toBe('2 min 50 s');
    expect(formatDuration(45)).toBe('45 s');
  });
});

describe('biblioteca y datos', () => {
  it('todos los grooves tienen pistas de la longitud correcta', () => {
    expect(BUILTIN_GROOVES.length).toBeGreaterThanOrEqual(70);
    for (const g of BUILTIN_GROOVES) {
      const len = pulsesPerBar(g.meter) * g.pattern.stepsPerBeat * g.pattern.bars;
      for (const [id, t] of Object.entries(g.pattern.tracks)) {
        expect(t.length, `${g.id} ${id}`).toBe(len);
        expect(t.some((l) => l > 0), `${g.id} ${id} vacío`).toBe(true);
      }
      expect(sanitizeGroove(g), g.id).not.toBeNull();
    }
    expect(new Set(BUILTIN_GROOVES.map((g) => g.id)).size).toBe(BUILTIN_GROOVES.length);
  });
  it('hydrate tolera datos corruptos', () => {
    expect(hydrate(null)).toEqual(defaultState());
    const s = hydrate({ bpm: 'x', meter: { num: 99, den: 3 }, metronome: { subdivision: 7, steps: 'no' }, library: { user: [{ bogus: 1 }] } });
    expect(s.bpm).toBe(100);
    expect(s.meter).toEqual({ num: 32, den: 4 });
    expect(s.metronome.steps).toHaveLength(32);
    expect(s.library.user).toEqual([]);
  });
  it('hydrate conserva un estado válido', () => {
    const s = defaultState();
    s.bpm = 133;
    s.library.user.push({ ...BUILTIN_GROOVES[0], id: 'u:1', builtin: undefined });
    const back = hydrate(JSON.parse(JSON.stringify(s)));
    expect(back.bpm).toBe(133);
    expect(back.library.user[0].pattern.tracks).toEqual(BUILTIN_GROOVES[0].pattern.tracks);
    expect(back.editor).toEqual(s.editor);
  });
  it('migra la configuración de práctica del formato anterior', () => {
    const s = hydrate({
      practice: {
        ramp: { on: true, everyBars: 2, step: -5, limit: 80 },
        gap: { on: true, playBars: 3, muteBars: 1 },
        sequence: { on: true, loop: false, blocks: [{ bars: 2, bpm: 90, mode: 'beats' }] },
      },
    });
    expect(s.practice.ramp).toMatchObject({ on: true, mode: 'step', everyBars: 2, step: 5, target: 80 });
    expect(s.practice.gap).toMatchObject({ on: true, playBars: 3, muteBars: 1, random: false, what: 'click' });
    expect(s.practice.sequence).toEqual({ on: true, repeats: 1, blocks: [{ bars: 2, bpm: 90, mode: 'beats', sub: 0 }] });
    expect(s.practice.timer.on).toBe(false);
    expect(s.metronome.poly.layers.length).toBe(1);
  });

  it('importa grooves con pistas en texto', () => {
    const g = sanitizeGroove({ name: 'T', meter: { num: 4, den: 4 }, bpm: 90, pattern: { stepsPerBeat: 2, bars: 1, tracks: { kick: 'x. .. x. ..', nope: 'xxxx' } } });
    expect(g?.pattern.tracks).toEqual({ kick: [2, 0, 0, 0, 2, 0, 0, 0] });
  });
});
