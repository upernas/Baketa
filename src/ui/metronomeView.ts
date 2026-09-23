import { POLY_COLORS, type Controller } from '../app/controller';
import { soundShort } from '../audio/sounds';
import {
  BPM_MAX, BPM_MIN, COMMON_METERS, countLabels, groupings, isCompound, meterKey, parseMeter, pulsesPerBar,
  pulseUnit, sameMeter, subdivisionLabel, subdivisionOptions, tempoName,
} from '../core/meter';
import { MET_PRESETS, type MetPresetId } from '../core/patterns';
import type { Level, Meter } from '../core/types';
import {
  ICONS, field, h, icon, numberField, range, repeatButton, segmented, select, soundSelect, stepper, toggle,
} from './dom';
import { Visualizer, type VizLayer } from './viz';

export interface View {
  el: HTMLElement;
}

export const LEVEL_NAMES = ['Silencio', 'Suave', 'Normal', 'Acento'];

export function meterPicker(meter: Meter, onChange: (m: Meter) => void): HTMLElement {
  const common = COMMON_METERS.map((m) => ({ value: meterKey(m), label: meterKey(m) }));
  const isCommon = COMMON_METERS.some((m) => sameMeter(m, meter));
  return h(
    'div',
    { class: 'meter-picker' },
    segmented(common, isCommon ? meterKey(meter) : null, (v) => onChange(parseMeter(v)), 'wrap meters', 'Compás'),
    h(
      'div',
      { class: 'meter-custom' },
      h('span', { class: 'muted' }, 'Otro'),
      stepper(meter.num, 1, 32, (num) => onChange({ num, den: meter.den }), 'pulsos'),
      h('span', { class: 'meter-slash' }, '/'),
      select(
        [2, 4, 8, 16].map((d) => ({ value: String(d), label: String(d) })),
        String(meter.den),
        (v) => onChange({ num: meter.num, den: Number(v) }),
        { 'aria-label': 'Denominador' },
      ),
    ),
  );
}

export function swingControl(
  swing: { amount: number; unit: 2 | 4 },
  onChange: (s: { amount: number; unit: 2 | 4 }) => void,
): HTMLElement {
  const value = h('output', { class: 'swing-value' }, `${Math.round(swing.amount * 100)} %`);
  const slider = range(swing.amount * 100, 50, 75, 1, (v) => {
    value.textContent = `${v} %`;
  }, { 'aria-label': 'Swing' });
  slider.addEventListener('change', () => onChange({ ...swing, amount: Number(slider.value) / 100 }));
  return h(
    'div',
    { class: 'swing' },
    h('div', { class: 'swing-row' }, h('span', null, 'Swing'), slider, value),
    h(
      'div',
      { class: 'swing-row' },
      h('span', { class: 'muted' }, 'Afecta a'),
      segmented(
        [
          { value: 2, label: 'Corcheas' },
          { value: 4, label: 'Semicorcheas' },
        ],
        swing.unit,
        (unit) => onChange({ ...swing, unit: unit as 2 | 4 }),
        'small',
        'Resolución del swing',
      ),
    ),
  );
}

export function metronomeView(app: Controller): View {
  const st = () => app.store.state;
  const root = h('section', { class: 'view view-met', 'aria-label': 'Metrónomo' });

  /* ---- tempo ---- */
  const unit = h('span', { class: 'bpm-unit' });
  const bpmInput = numberField(st().bpm, BPM_MIN, BPM_MAX, (v) => app.setBpm(v), {
    class: 'bpm-input',
    'aria-label': 'Tempo en BPM',
  });
  const nameEl = h('span', { class: 'tempo-name' });
  const slider = range(st().bpm, BPM_MIN, BPM_MAX, 1, (v) => app.setBpm(v), {
    class: 'bpm-slider',
    'aria-label': 'Tempo',
  });
  const tapCount = h('span', { class: 'tap-count', 'aria-hidden': 'true' });
  let lastTapPointer = 0;
  const tapBtn = h(
    'button',
    {
      type: 'button',
      class: 'btn tap-btn',
      title: 'Tap tempo (T)',
      onpointerdown: (e: PointerEvent) => {
        e.preventDefault();
        lastTapPointer = performance.now();
        app.tap();
        pulseTap();
      },
      onclick: (e: MouseEvent) => {
        // Solo teclado: en táctil el click posterior al toque también llega con detail 0
        if (e.detail === 0 && performance.now() - lastTapPointer > 800) {
          app.tap();
          pulseTap();
        }
      },
    },
    'Tap tempo',
    tapCount,
  );
  function pulseTap() {
    tapBtn.classList.remove('hit');
    void tapBtn.offsetWidth;
    tapBtn.classList.add('hit');
    const n = app.tapper.count;
    tapCount.textContent = n > 0 ? '•'.repeat(Math.min(n, 8)) : '';
  }

  const tempoCard = h(
    'div',
    { class: 'panel tempo' },
    h(
      'div',
      { class: 'bpm-row' },
      repeatButton('−', () => app.nudge(-1), { class: 'btn round', 'aria-label': 'Bajar 1 BPM' }),
      h('div', { class: 'bpm-display' }, h('div', { class: 'bpm-line' }, unit, bpmInput), h('div', { class: 'bpm-caption' }, h('span', null, 'BPM'), nameEl)),
      repeatButton('+', () => app.nudge(1), { class: 'btn round', 'aria-label': 'Subir 1 BPM' }),
    ),
    h(
      'div',
      { class: 'slider-row' },
      repeatButton('−5', () => app.nudge(-5), { class: 'btn small', 'aria-label': 'Bajar 5 BPM' }),
      slider,
      repeatButton('+5', () => app.nudge(5), { class: 'btn small', 'aria-label': 'Subir 5 BPM' }),
    ),
    tapBtn,
  );

  function syncTempo() {
    const s = st();
    if (document.activeElement !== bpmInput) bpmInput.value = String(s.bpm);
    slider.value = String(s.bpm);
    nameEl.textContent = tempoName(s.bpm);
    const u = pulseUnit(s.meter);
    unit.textContent = `${u.symbol} =`;
    unit.title = `El BPM se refiere a la ${u.name}`;
  }

  /* ---- compás y subdivisión ---- */
  const meterCard = h('div', { class: 'panel' });
  const subCard = h('div', { class: 'panel' });

  function renderMeter() {
    meterCard.replaceChildren(h('h3', null, 'Compás'), meterPicker(st().meter, (m) => app.setMeter(m)));
  }

  function renderSub() {
    const s = st();
    const m = s.meter;
    const opts = subdivisionOptions(m).map((n) => ({
      value: n,
      title: subdivisionLabel(m, n),
      label: h('span', { class: 'sub-opt' }, h('b', null, String(n)), h('small', null, subdivisionLabel(m, n))),
    }));
    const binary = !isCompound(m) && [2, 4, 8].includes(s.metronome.subdivision);
    subCard.replaceChildren(
      h('h3', null, 'Clicks por pulso'),
      segmented(opts, s.metronome.subdivision, (v) => app.setSubdivision(v), 'wrap subs', 'Subdivisión'),
      ...(binary
        ? [swingControl(s.metronome.swing, (sw) => app.store.update('metronome', (x) => (x.metronome.swing = sw)))]
        : []),
    );
  }

  /* ---- patrón ---- */
  const patCard = h('div', { class: 'panel pattern' });
  let cells: HTMLButtonElement[] = [];
  let pulseEls: HTMLElement[] = [];
  let lit = -1;
  let litPulse = -1;
  let soundMode = false;
  let selected = 0;

  function renderPattern() {
    const s = st();
    const m = s.meter;
    const met = s.metronome;
    const sub = met.subdivision;
    const pulses = pulsesPerBar(m);
    const labels = countLabels(m, sub);
    cells = [];
    pulseEls = [];
    lit = -1;
    litPulse = -1;
    if (selected >= met.steps.length) selected = 0;

    const grid = h('div', { class: `met-grid ${sub > 1 ? 'has-sub' : ''}`, style: `--sub:${sub}` });
    for (let p = 0; p < pulses; p++) {
      const col = h('div', { class: 'met-pulse' });
      for (let k = 0; k < sub; k++) {
        const i = p * sub + k;
        const step = met.steps[i] ?? { level: 0 as Level };
        const cell = h(
          'button',
          {
            type: 'button',
            class: `mcell lvl-${step.level}${k === 0 ? ' head' : ''}${soundMode && i === selected ? ' sel' : ''}`,
            'aria-label': `${labels[i]}: ${LEVEL_NAMES[step.level]}${step.sound ? `, ${step.sound}` : ''}`,
            onclick: () => {
              if (soundMode) {
                selected = i;
                renderPattern();
                const snd = step.sound ?? (step.level === 3 ? met.sounds.accent : step.level === 2 ? met.sounds.beat : met.sounds.sub);
                if (step.level > 0) app.audio.preview(snd);
              } else {
                app.cycleMetStep(i);
              }
            },
          },
          h('span', { class: 'mdot' }, step.sound ? soundShort(step.sound) : ''),
          h('span', { class: 'mlabel' }, labels[i]),
        );
        cells.push(cell);
        col.append(cell);
      }
      pulseEls.push(col);
      grid.append(col);
    }

    const presets = select<string>(
      [{ value: '', label: 'Plantillas…' }, ...MET_PRESETS.map((p) => ({ value: p.id, label: p.label }))],
      '',
      (v) => {
        if (v) app.applyMetPreset(v as MetPresetId);
      },
      { 'aria-label': 'Aplicar plantilla de patrón' },
    );

    const groups = isCompound(m) ? [] : groupings(pulses);
    const groupSel = groups.length
      ? select<string>(
          [{ value: '', label: 'Agrupación…' }, ...groups.map((g) => ({ value: g.join('+'), label: g.join(' + ') }))],
          '',
          (v) => {
            if (v) app.applyGrouping(v.split('+').map(Number));
          },
          { 'aria-label': 'Acentuar por grupos' },
        )
      : null;

    let editor: HTMLElement | null = null;
    if (soundMode) {
      const step = met.steps[selected];
      editor = h(
        'div',
        { class: 'step-editor' },
        h('div', { class: 'step-editor-title' }, `Paso ${labels[selected]}`),
        segmented(
          ([3, 2, 1, 0] as Level[]).map((l) => ({ value: l, label: LEVEL_NAMES[l] })),
          step?.level ?? 0,
          (l) => app.setMetStep(selected, { level: l as Level }),
          'small wrap',
          'Intensidad del paso',
        ),
        field(
          'Sonido',
          soundSelect(step?.sound ?? '', (v) => {
            app.setMetStep(selected, { sound: v || undefined });
            if (v) app.audio.preview(v);
          }, { auto: 'Según intensidad', label: 'Sonido del paso' }),
        ),
      );
    }

    patCard.replaceChildren(
      h('div', { class: 'panel-head' }, h('h3', null, 'Patrón'), h('div', { class: 'row wrap' }, ...(groupSel ? [groupSel] : []), presets)),
      h('p', { class: 'hint' }, soundMode ? 'Toca un paso para elegir su intensidad y sonido.' : 'Toca un paso para cambiar su intensidad.'),
      grid,
      h(
        'div',
        { class: 'legend', 'aria-hidden': 'true' },
        h('span', { class: 'lg lvl-3' }, 'Acento'),
        h('span', { class: 'lg lvl-2' }, 'Normal'),
        h('span', { class: 'lg lvl-1' }, 'Suave'),
        h('span', { class: 'lg lvl-0' }, 'Silencio'),
      ),
      toggle('Asignar sonido por paso', soundMode, (v) => {
        soundMode = v;
        renderPattern();
      }),
      ...(editor ? [editor] : []),
    );
    if (app.state === 'playing' && app.mode === 'metronome') highlight(app.current.metStep);
  }

  function highlight(step: number) {
    if (lit >= 0) cells[lit]?.classList.remove('on');
    lit = step;
    if (step >= 0) cells[step]?.classList.add('on');
    const sub = st().metronome.subdivision;
    const pulse = step >= 0 ? Math.floor(step / sub) : -1;
    if (pulse !== litPulse) {
      if (litPulse >= 0) pulseEls[litPulse]?.classList.remove('now');
      litPulse = pulse;
      if (pulse >= 0) pulseEls[pulse]?.classList.add('now');
    }
  }

  /* ---- sonidos ---- */
  const soundCard = h('div', { class: 'panel' });
  function renderSounds() {
    const snd = st().metronome.sounds;
    const row = (key: 'accent' | 'beat' | 'sub', label: string, lvl: number) =>
      h(
        'div',
        { class: 'sound-row' },
        h('span', { class: `swatch lvl-${lvl}`, 'aria-hidden': 'true' }),
        h('span', { class: 'sound-row-label' }, label),
        soundSelect(snd[key], (v) => {
          app.store.update('metronome', (s) => (s.metronome.sounds[key] = v));
          app.audio.preview(v);
        }, { label: `Sonido ${label}` }),
        h('button', { type: 'button', class: 'btn icon-btn ghost', 'aria-label': `Escuchar ${label}`, onclick: () => app.audio.preview(snd[key]) }, '▸'),
      );
    soundCard.replaceChildren(
      h('h3', null, 'Sonidos'),
      row('accent', 'Acento', 3),
      row('beat', 'Normal', 2),
      row('sub', 'Suave', 1),
      h('p', { class: 'hint' }, 'Por defecto el primer tiempo va acentuado, el resto de pulsos son normales y las subdivisiones suaves.'),
    );
  }

  /* ---- visualizador ---- */
  const viz = new Visualizer();
  const vizCard = h('div', { class: 'panel viz-panel' }, h('h3', null, 'Visualizador'), viz.el);
  let vizStepsPerBar = 0;
  let vizCycle = 1;

  function renderViz() {
    const s = st();
    const met = s.metronome;
    const pulses = pulsesPerBar(s.meter);
    const sub = met.subdivision;
    const poly = met.poly;
    vizCycle = poly.on ? poly.cycleBars : 1;
    vizStepsPerBar = pulses * sub;
    const total = vizStepsPerBar * vizCycle;
    const positions: number[] = [];
    const levels: number[] = [];
    for (let c = 0; c < vizCycle; c++) {
      for (let i = 0; i < vizStepsPerBar; i++) {
        positions.push((c * vizStepsPerBar + i) / total);
        levels.push(met.steps[i]?.level ?? 0);
      }
    }
    const layers: VizLayer[] = [
      { key: 'met', label: `Metrónomo: ${pulses * vizCycle} pulsos`, color: 'var(--brass)', positions, levels, ticks: pulses * vizCycle },
    ];
    if (poly.on) {
      poly.layers.forEach((l, i) =>
        layers.push({
          key: `p${i}`,
          label: `${l.n} golpes`,
          color: POLY_COLORS[i % POLY_COLORS.length],
          positions: Array.from({ length: l.n }, (_, k) => k / l.n),
          levels: Array.from({ length: l.n }, (_, k) => (k === 0 && l.accent ? 3 : 2)),
          muted: l.mute,
        }),
      );
    }
    viz.setLayers(layers);
  }

  /* ---- polirritmia ---- */
  const polyCard = h('div', { class: 'panel poly' });
  const POLY_PRESETS: { label: string; pulses: number; layers: number[] }[] = [
    { label: '3:2', pulses: 2, layers: [3] },
    { label: '4:3', pulses: 3, layers: [4] },
    { label: '3:4', pulses: 4, layers: [3] },
    { label: '5:4', pulses: 4, layers: [5] },
    { label: '5:3', pulses: 3, layers: [5] },
    { label: '7:4', pulses: 4, layers: [7] },
    { label: '3:4:5', pulses: 4, layers: [3, 5] },
    { label: '2:3:4', pulses: 3, layers: [2, 4] },
  ];

  function renderPoly() {
    const s = st();
    const poly = s.metronome.poly;
    const pulses = pulsesPerBar(s.meter) * poly.cycleBars;
    const layers = poly.layers.map((l, i) => {
      const upd = (patch: Partial<typeof l>) => app.updatePoly((p) => Object.assign(p.layers[i], patch));
      // El volumen de la capa se aplica al soltar (afecta a los golpes siguientes)
      const vol = range(l.vol, 0, 1.5, 0.01, () => undefined, { 'aria-label': `Volumen capa ${i + 1}` });
      vol.addEventListener('change', () => upd({ vol: Number(vol.value) }));
      return h(
        'div',
        { class: `poly-layer${l.mute ? ' muted' : ''}`, style: `--c:${POLY_COLORS[i % POLY_COLORS.length]}` },
        h('span', { class: 'poly-swatch', 'aria-hidden': 'true' }),
        h('div', { class: 'poly-main' },
          h('div', { class: 'poly-ratio' }, stepper(l.n, 1, 32, (n) => upd({ n }), 'golpes'), h('span', { class: 'muted' }, `contra ${pulses}`)),
          h('div', { class: 'poly-controls' },
            soundSelect(l.sound, (v) => {
              upd({ sound: v });
              app.audio.preview(v);
            }, { label: `Sonido capa ${i + 1}` }),
            vol,
          ),
        ),
        h('div', { class: 'poly-actions' },
          h('button', {
            type: 'button', class: `bmute${l.accent ? ' on-accent' : ''}`, title: 'Acentuar el primer golpe del ciclo',
            'aria-label': 'Acentuar el primer golpe del ciclo',
            'aria-pressed': String(l.accent), onclick: () => upd({ accent: !l.accent }),
          }, '>'),
          h('button', {
            type: 'button', class: `bmute${l.mute ? ' on' : ''}`, 'aria-pressed': String(l.mute), 'aria-label': 'Silenciar capa',
            onclick: () => upd({ mute: !l.mute }),
          }, icon(l.mute ? ICONS.mute : ICONS.speaker, 16)),
          h('button', {
            type: 'button', class: 'bmute', 'aria-label': 'Quitar capa',
            onclick: () => app.updatePoly((p) => p.layers.splice(i, 1)),
          }, icon(ICONS.close, 16)),
        ),
      );
    });

    polyCard.replaceChildren(
      h('div', { class: 'panel-head' }, h('h3', null, 'Polirritmia'), toggle('', poly.on, (v) => app.updatePoly((p) => (p.on = v)))),
      h('p', { class: 'hint' }, `Cada capa reparte sus golpes a partes iguales en el ciclo mientras el metrónomo marca ${pulses} pulsos.`),
      h('div', { class: 'row wrap' },
        h('span', { class: 'muted' }, 'Rápidas'),
        segmented(POLY_PRESETS.map((p) => ({ value: p.label, label: p.label, title: `${p.layers.join(' y ')} contra ${p.pulses}` })), null, (v) => {
          const pr = POLY_PRESETS.find((x) => x.label === v);
          if (pr) app.applyPolyPreset(pr.pulses, pr.layers);
        }, 'wrap small chips', 'Polirritmias rápidas'),
      ),
      h('div', { class: 'row wrap' },
        h('span', { class: 'muted' }, 'Ciclo'),
        segmented([1, 2, 3, 4].map((n) => ({ value: n, label: n === 1 ? '1 compás' : `${n}` })), poly.cycleBars, (v) => app.updatePoly((p) => (p.cycleBars = v)), 'small', 'Compases por ciclo'),
      ),
      ...layers,
      ...(poly.layers.length < 6
        ? [h('button', { type: 'button', class: 'btn small', onclick: () => app.addPolyLayer(poly.layers.length ? 5 : 3) }, icon(ICONS.plus, 16), 'Añadir capa')]
        : []),
    );
  }

  root.append(
    h('div', { class: 'col col-main' }, tempoCard, patCard, vizCard),
    h('div', { class: 'col col-side' }, meterCard, subCard, soundCard, polyCard),
  );

  syncTempo();
  renderMeter();
  renderSub();
  renderPattern();
  renderSounds();
  renderViz();
  renderPoly();

  app.store.subscribe((keys) => {
    const all = keys.has('all');
    if (all || keys.has('bpm') || keys.has('meter')) syncTempo();
    if (all || keys.has('meter')) renderMeter();
    if (all || keys.has('meter') || keys.has('metronome')) {
      renderSub();
      renderPattern();
      renderSounds();
      renderViz();
      renderPoly();
    }
  });

  app.onTick((e) => {
    if (app.mode !== 'metronome') return;
    const sub = st().metronome.subdivision;
    if (e.kind === 'met' && e.sub === sub) {
      highlight(e.mode === 'silent' ? -1 : e.step);
      if (e.mode !== 'silent') viz.hit('met', (e.bar % vizCycle) * vizStepsPerBar + e.step);
    } else if (e.kind === 'poly' && e.mode !== 'silent') {
      viz.hit(`p${e.layer}`, e.step);
    }
  });
  app.onFrame((ph) => {
    if (!viz.visible) return;
    if (!ph || app.mode !== 'metronome') {
      viz.frame(null, String(pulsesPerBar(st().meter)));
      return;
    }
    const cyclePulses = ph.pulses * vizCycle;
    const pos = ph.pulse % cyclePulses;
    viz.frame(pos / cyclePulses, String(Math.floor(ph.pulse % ph.pulses) + 1));
  });
  app.onTransport(() => {
    if (app.state !== 'playing') highlight(-1);
  });

  return { el: root };
}
