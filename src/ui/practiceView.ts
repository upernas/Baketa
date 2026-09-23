import type { Controller } from '../app/controller';
import { BPM_MAX, BPM_MIN, pulsesPerBar, subdivisionLabel, subdivisionOptions } from '../core/meter';
import {
  CLICK_MODES, formatClock, formatDuration, isGapBar, planRamp, rampEstimate, sequenceActive,
  sequenceEstimate, sequenceLength, timerLimit,
} from '../core/practice';
import type { ClickMode, PracticeState, RampAfter, RampMode, SeqBlock, TimerState } from '../core/types';
import { ICONS, field, h, icon, modal, numberField, range, segmented, select, toggle } from './dom';
import type { View } from './metronomeView';

type Update = (fn: (p: PracticeState) => void) => void;

/** Campo mm:ss que guarda segundos. */
export function durationField(seconds: number, onCommit: (s: number) => void, label: string, max = 36000): HTMLElement {
  const min = numberField(Math.floor(seconds / 60), 0, Math.floor(max / 60), () => commit(), { 'aria-label': `${label}: minutos` });
  const sec = numberField(seconds % 60, 0, 59, () => commit(), { 'aria-label': `${label}: segundos` });
  const commit = () => {
    const total = Math.max(5, Math.min(max, Number(min.value) * 60 + Number(sec.value)));
    if (total !== seconds) onCommit(total);
  };
  return h('div', { class: 'duration' }, min, h('span', null, 'min'), sec, h('span', null, 's'));
}

/** Bloque BPM opcional: vacío = mantener el tempo actual. */
function optionalBpm(value: number, onCommit: (v: number) => void, label: string): HTMLInputElement {
  const el = h('input', {
    type: 'number', inputmode: 'numeric', min: BPM_MIN, max: BPM_MAX, placeholder: 'actual',
    value: value ? String(value) : '', 'aria-label': label, title: 'Vacío = tempo actual',
  });
  el.addEventListener('focus', () => el.select());
  el.addEventListener('keydown', (e) => e.key === 'Enter' && el.blur());
  el.addEventListener('change', () => {
    const raw = el.value.trim();
    const v = raw === '' || Number(raw) <= 0 ? 0 : Math.min(BPM_MAX, Math.max(BPM_MIN, Math.round(Number(raw)) || 0));
    el.value = v ? String(v) : '';
    onCommit(v);
  });
  return el;
}

function timerControls(t: TimerState, update: Update, bpm: number, pulses: number): HTMLElement[] {
  const byTime = t.by === 'time';
  const est = byTime
    ? `unos ${Math.floor(t.seconds / ((pulses * 60) / bpm))} compases a ${bpm} BPM`
    : `unos ${formatDuration((t.bars * pulses * 60) / bpm)} a ${bpm} BPM`;
  return [
    toggle('Parar automáticamente', t.on, (v) => update((p) => (p.timer.on = v))),
    segmented(
      [
        { value: 'time', label: 'Por tiempo' },
        { value: 'bars', label: 'Por compases' },
      ],
      t.by,
      (v) => update((p) => (p.timer.by = v as TimerState['by'])),
      'small',
      'Tipo de temporizador',
    ),
    byTime
      ? h(
          'div',
          { class: 'row wrap' },
          durationField(t.seconds, (v) => update((p) => ((p.timer.seconds = v), (p.timer.on = true))), 'Duración'),
          segmented(
            [1, 5, 10, 15, 20, 30].map((m) => ({ value: m * 60, label: `${m}′` })),
            t.seconds,
            (v) => update((p) => ((p.timer.seconds = v), (p.timer.on = true))),
            'small chips wrap',
            'Duraciones rápidas',
          ),
        )
      : h(
          'div',
          { class: 'row wrap' },
          field('Compases', numberField(t.bars, 1, 9999, (v) => update((p) => ((p.timer.bars = v), (p.timer.on = true))))),
          segmented(
            [4, 8, 16, 32, 64, 100].map((n) => ({ value: n, label: String(n) })),
            t.bars,
            (v) => update((p) => ((p.timer.bars = v), (p.timer.on = true))),
            'small chips wrap',
            'Compases rápidos',
          ),
        ),
    h('p', { class: 'hint' }, `Equivale a ${est}.`),
  ];
}

/** Ventana rápida del temporizador (desde la barra inferior). */
export function openTimerModal(app: Controller): void {
  const body = h('div', { class: 'timer-modal' });
  const update: Update = (fn) => {
    app.store.update('practice', (s) => fn(s.practice));
    render();
  };
  const render = () => {
    const s = app.store.state;
    const pulses = pulsesPerBar(s.practice.source === 'beat' ? s.editor.meter : s.meter);
    body.replaceChildren(...timerControls(s.practice.timer, update, s.bpm, pulses));
  };
  render();
  modal('Temporizador', body, [{ label: 'Hecho', primary: true }]);
}

export function practiceView(app: Controller): View {
  const st = () => app.store.state;
  const pr = () => app.store.state.practice;
  const update: Update = (fn) => app.store.update('practice', (s) => fn(s.practice));
  const root = h('section', { class: 'view view-practice', 'aria-label': 'Práctica' });

  const activeMeter = () => (pr().source === 'beat' ? st().editor.meter : st().meter);
  const fromBpm = () => {
    const r = pr().ramp;
    if (app.state !== 'stopped') return app.rampBase;
    return r.from > 0 ? r.from : st().bpm;
  };

  /* ---------- panel en vivo ---------- */
  const live = h('div', { class: 'panel live' });
  const liveBpm = h('b', { class: 'live-bpm' });
  const liveTarget = h('span', { class: 'live-target' });
  const liveBar = h('div', { class: 'progress' }, h('i'));
  const liveBarLabel = h('span', { class: 'progress-label' });
  const statBar = h('b');
  const statTime = h('b');
  const statState = h('b');
  const statExtra = h('b');
  const statExtraLabel = h('span');
  const playBtn = h('button', { type: 'button', class: 'btn primary live-play', onclick: () => app.toggle('practice') });

  function renderLiveStatic() {
    const p = pr();
    const chips: string[] = [];
    if (sequenceActive(p)) chips.push('Secuencia');
    else {
      if (p.ramp.on) chips.push(p.ramp.target >= fromBpm() ? 'Subida de tempo' : 'Bajada de tempo');
      if (p.gap.on) chips.push(p.gap.random ? 'Silencios aleatorios' : 'Compases en silencio');
    }
    if (p.timer.on) chips.push('Temporizador');
    live.replaceChildren(
      h(
        'div',
        { class: 'live-head' },
        h('div', null,
          h('span', { class: 'muted' }, 'Practicar con'),
          segmented(
            [
              { value: 'metronome', label: 'Metrónomo' },
              { value: 'beat', label: `Beat: ${st().editor.name}` },
            ],
            p.source,
            (v) => update((x) => (x.source = v as PracticeState['source'])),
            'small',
            'Qué suena',
          ),
        ),
        playBtn,
      ),
      h('div', { class: 'live-tempo' }, liveBpm, h('span', { class: 'muted' }, 'BPM'), liveTarget),
      h('div', { class: 'live-progress' }, liveBar, liveBarLabel),
      h(
        'div',
        { class: 'stats' },
        h('div', null, h('span', null, 'Compás'), statBar),
        h('div', null, h('span', null, 'Tiempo'), statTime),
        h('div', null, h('span', null, 'Ahora'), statState),
        h('div', null, statExtraLabel, statExtra),
      ),
      h('div', { class: 'chips-row' }, chips.length ? chips.map((c) => h('span', { class: 'chip' }, c)) : h('span', { class: 'muted' }, 'Activa alguna opción de abajo. El play de esta pestaña usa lo que elijas aquí.')),
    );
    updateLive();
  }

  let lastLive = 0;
  function updateLive() {
    const p = pr();
    const s = st();
    const playing = app.state !== 'stopped' && app.isContext('practice');
    const ph = playing ? app.phase() : null;
    const bar = ph?.bar ?? 0;
    const elapsed = ph?.elapsed ?? 0;

    playBtn.replaceChildren(icon(app.state === 'playing' && app.isContext('practice') ? ICONS.pause : ICONS.play, 22), app.state === 'playing' && app.isContext('practice') ? 'Pausa' : app.state === 'paused' && app.isContext('practice') ? 'Continuar' : 'Empezar');
    // Parado con rampa: se muestra el tempo con el que empezará
    liveBpm.textContent = String(!playing && p.ramp.on && !sequenceActive(p) ? fromBpm() : s.bpm);

    // Progreso: temporizador, rampa o secuencia
    let progress = 0;
    let progressText = '';
    const lim = timerLimit(p.timer);
    if (p.ramp.on && !sequenceActive(p)) {
      const from = fromBpm();
      const r = planRamp(p.ramp, from, bar, elapsed);
      progress = playing ? r.progress : 0;
      liveTarget.textContent = `${from} → ${p.ramp.target}`;
      progressText = `Rampa ${Math.round(progress * 100)} %`;
    } else {
      liveTarget.textContent = '';
    }
    if (sequenceActive(p)) {
      const total = sequenceLength(p.sequence.blocks);
      progress = playing ? ((bar % total) + (ph ? (ph.pulse % ph.pulses) / ph.pulses : 0)) / total : 0;
      progressText = `Secuencia ${Math.round(progress * 100)} %`;
    }
    if (lim.seconds || lim.bars) {
      const done = lim.seconds ? elapsed / lim.seconds : (bar + (ph ? (ph.pulse % ph.pulses) / ph.pulses : 0)) / lim.bars;
      if (!progressText) {
        progress = Math.min(1, done);
        progressText = `Temporizador ${Math.round(progress * 100)} %`;
      }
      statExtraLabel.textContent = 'Queda';
      statExtra.textContent = lim.seconds ? formatClock(lim.seconds - elapsed) : `${Math.max(0, lim.bars - bar)} compases`;
    } else {
      if (sequenceActive(p)) {
        statExtraLabel.textContent = 'Bloque';
        statExtra.textContent = app.current.block >= 0 && playing ? `${app.current.block + 1} de ${p.sequence.blocks.length}` : '—';
      } else {
        statExtraLabel.textContent = 'Objetivo';
        statExtra.textContent = p.ramp.on ? `${p.ramp.target} BPM` : '—';
      }
    }
    (liveBar.firstChild as HTMLElement).style.width = `${Math.round(progress * 1000) / 10}%`;
    liveBarLabel.textContent = progressText;
    statBar.textContent = playing ? String(bar + 1) : '—';
    statTime.textContent = formatClock(elapsed);
    statState.textContent = !playing ? (app.state === 'stopped' ? 'Parado' : '—') : app.current.mode === 'silent' ? 'Silencio' : 'Con click';
    statState.classList.toggle('silent', playing && app.current.mode === 'silent');

    seqBlocks.forEach((el, i) => el.classList.toggle('active', playing && app.current.block === i));
  }

  /* ---------- temporizador ---------- */
  const timerCard = h('div', { class: 'panel' });
  function renderTimer() {
    timerCard.replaceChildren(h('h3', null, 'Temporizador'), ...timerControls(pr().timer, update, st().bpm, pulsesPerBar(activeMeter())));
  }

  /* ---------- rampa ---------- */
  const rampCard = h('div', { class: 'panel' });
  function renderRamp() {
    const r = pr().ramp;
    const from = r.from > 0 ? r.from : st().bpm;
    const est = rampEstimate(r, from, pulsesPerBar(activeMeter()));
    const dir = r.target >= from ? 'Subir' : 'Bajar';
    let how: HTMLElement;
    if (r.mode === 'step') {
      how = h(
        'div',
        { class: 'inline-fields' },
        field('Cada (compases)', numberField(r.everyBars, 1, 64, (v) => update((p) => (p.ramp.everyBars = v)))),
        field(`${dir} (BPM)`, numberField(r.step, 1, 40, (v) => update((p) => (p.ramp.step = v)))),
      );
    } else if (r.mode === 'bars') {
      how = h('div', { class: 'inline-fields' }, field('Llegar en (compases)', numberField(r.bars, 1, 2000, (v) => update((p) => (p.ramp.bars = v)))));
    } else {
      how = h('div', { class: 'inline-fields' }, field('Llegar en', durationField(r.seconds, (v) => update((p) => (p.ramp.seconds = v)), 'Duración de la rampa')));
    }
    const holdUnit = r.mode === 'time' ? 'segundos' : 'compases';
    const summary =
      from === r.target
        ? 'El tempo inicial y el objetivo son iguales.'
        : `De ${from} a ${r.target} BPM en ${est.bars} compases, unos ${formatDuration(est.seconds)}.`;

    rampCard.replaceChildren(
      h('h3', null, 'Subida o bajada de tempo'),
      toggle('Cambiar el tempo poco a poco', r.on, (v) => update((p) => (p.ramp.on = v))),
      h(
        'div',
        { class: 'inline-fields' },
        field('Desde (BPM)', optionalBpm(r.from, (v) => update((p) => (p.ramp.from = v)), 'BPM inicial')),
        h('span', { class: 'ramp-arrow', 'aria-hidden': 'true' }, '→'),
        field('Hasta (BPM)', numberField(r.target, BPM_MIN, BPM_MAX, (v) => update((p) => (p.ramp.target = v)))),
      ),
      field(
        'Cómo',
        segmented<RampMode>(
          [
            { value: 'step', label: 'Por pasos' },
            { value: 'bars', label: 'En N compases' },
            { value: 'time', label: 'En un tiempo' },
          ],
          r.mode,
          (v) => update((p) => (p.ramp.mode = v)),
          'wrap',
          'Modo de la rampa',
        ),
      ),
      how,
      h('p', { class: 'summary' }, summary),
      field(
        'Al llegar',
        h(
          'div',
          { class: 'row wrap' },
          segmented<RampAfter>(
            [
              { value: 'hold', label: 'Mantener' },
              { value: 'restart', label: 'Repetir' },
              { value: 'stop', label: 'Parar' },
            ],
            r.after,
            (v) => update((p) => (p.ramp.after = v)),
            'small',
            'Al llegar al objetivo',
          ),
          r.after !== 'hold'
            ? h('label', { class: 'inline-label' }, numberField(r.hold, 0, 3600, (v) => update((p) => (p.ramp.hold = v)), { 'aria-label': `${holdUnit} en el objetivo` }), ` ${holdUnit} en el objetivo`)
            : null,
        ),
      ),
      h('p', { class: 'hint' }, 'Deja "Desde" vacío para empezar en el tempo actual. El cambio se aplica al empezar cada compás.'),
    );
  }

  /* ---------- silencios ---------- */
  const gapCard = h('div', { class: 'panel' });
  function renderGap() {
    const g = pr().gap;
    const preview = h(
      'div',
      { class: 'gap-preview', 'aria-label': 'Ejemplo de los próximos compases' },
      Array.from({ length: 16 }, (_, b) => h('i', { class: isGapBar({ ...pr(), gap: { ...g, on: true } }, b, 7) ? 'off' : '' })),
    );
    const chance = h('output', null, `${g.chance} %`);
    const chanceSlider = range(g.chance, 5, 90, 5, (v) => (chance.textContent = `${v} %`), { 'aria-label': 'Probabilidad de silencio' });
    chanceSlider.addEventListener('change', () => update((p) => (p.gap.chance = Number(chanceSlider.value))));
    gapCard.replaceChildren(
      h('h3', null, 'Compases en silencio'),
      toggle('Silenciar algunos compases', g.on, (v) => update((p) => (p.gap.on = v)), 'Comprueba que mantienes el tempo tú solo'),
      segmented(
        [
          { value: 'fixed', label: 'Fijos' },
          { value: 'random', label: 'Aleatorios' },
        ],
        g.random ? 'random' : 'fixed',
        (v) => update((p) => (p.gap.random = v === 'random')),
        'small',
        'Tipo de silencio',
      ),
      g.random
        ? h(
            'div',
            { class: 'stack' },
            h('div', { class: 'vol-row' }, h('span', null, 'Probabilidad'), chanceSlider, chance),
            field('Primeros compases siempre con click', numberField(g.playBars, 0, 64, (v) => update((p) => (p.gap.playBars = v)))),
          )
        : h(
            'div',
            { class: 'inline-fields' },
            field('Con click', numberField(g.playBars, 1, 64, (v) => update((p) => (p.gap.playBars = v)))),
            field('En silencio', numberField(g.muteBars, 1, 64, (v) => update((p) => (p.gap.muteBars = v)))),
          ),
      field(
        'Qué se silencia',
        segmented(
          [
            { value: 'click', label: 'Solo el click' },
            { value: 'all', label: 'Todo (también el beat)' },
          ],
          g.what,
          (v) => update((p) => (p.gap.what = v as 'click' | 'all')),
          'small wrap',
          'Qué se silencia',
        ),
      ),
      h('div', { class: 'gap-row' }, h('span', { class: 'muted' }, g.random ? 'Ejemplo' : 'Patrón'), preview),
    );
  }

  /* ---------- secuencia ---------- */
  const seqCard = h('div', { class: 'panel seq' });
  let seqBlocks: HTMLElement[] = [];
  function renderSeq() {
    const q = pr().sequence;
    const meter = activeMeter();
    const pulses = pulsesPerBar(meter);
    const bpm = st().bpm;
    const est = sequenceEstimate(q.blocks, bpm, pulses);
    const subOpts = [{ value: '0', label: 'Igual' }, ...subdivisionOptions(meter).map((n) => ({ value: String(n), label: subdivisionLabel(meter, n) }))];
    const move = (i: number, d: number) =>
      update((p) => {
        const b = p.sequence.blocks;
        const j = i + d;
        if (j < 0 || j >= b.length) return;
        [b[i], b[j]] = [b[j], b[i]];
      });

    seqBlocks = q.blocks.map((b, i) =>
      h(
        'div',
        { class: 'seq-block' },
        h('span', { class: 'seq-index' }, String(i + 1)),
        field('Compases', numberField(b.bars, 1, 256, (v) => update((p) => (p.sequence.blocks[i].bars = v)))),
        field('BPM', optionalBpm(b.bpm, (v) => update((p) => (p.sequence.blocks[i].bpm = v)), `BPM del bloque ${i + 1}`)),
        field('Click', select<ClickMode>(CLICK_MODES, b.mode, (v) => update((p) => (p.sequence.blocks[i].mode = v)))),
        field('Subdivisión', select<string>(subOpts, subOpts.some((o) => o.value === String(b.sub)) ? String(b.sub) : '0', (v) => update((p) => (p.sequence.blocks[i].sub = Number(v))))),
        h(
          'div',
          { class: 'seq-actions' },
          h('button', { type: 'button', class: 'bmute', 'aria-label': 'Subir bloque', disabled: i === 0, onclick: () => move(i, -1) }, '↑'),
          h('button', { type: 'button', class: 'bmute', 'aria-label': 'Bajar bloque', disabled: i === q.blocks.length - 1, onclick: () => move(i, 1) }, '↓'),
          h('button', { type: 'button', class: 'bmute', 'aria-label': 'Duplicar bloque', title: 'Duplicar', onclick: () => update((p) => p.sequence.blocks.splice(i + 1, 0, { ...b })) }, '⧉'),
          h('button', { type: 'button', class: 'bmute', 'aria-label': 'Quitar bloque', onclick: () => update((p) => p.sequence.blocks.splice(i, 1)) }, icon(ICONS.close, 16)),
        ),
      ),
    );

    const examples: { label: string; blocks: SeqBlock[] }[] = [
      { label: `Escalera ${bpm} → ${bpm + 20}`, blocks: [0, 5, 10, 15, 20].map((d) => ({ bars: 4, bpm: bpm + d, mode: 'full' as ClickMode, sub: 0 })) },
      { label: 'Completo · reducido · silencio', blocks: (['full', 'beats', 'downbeat', 'silent'] as ClickMode[]).map((mode) => ({ bars: 4, bpm: 0, mode, sub: 0 })) },
      {
        label: 'Subdivisiones 1-2-3-4',
        blocks: subdivisionOptions(meter).filter((n) => n <= 4).map((sub) => ({ bars: 2, bpm: 0, mode: 'full' as ClickMode, sub })),
      },
      { label: 'Pregunta y respuesta', blocks: [{ bars: 1, bpm: 0, mode: 'full', sub: 0 }, { bars: 1, bpm: 0, mode: 'silent', sub: 0 }] },
    ];

    seqCard.replaceChildren(
      h('h3', null, 'Secuencia de compases'),
      toggle('Usar una secuencia', q.on, (v) => update((p) => (p.sequence.on = v)), 'Tiene prioridad sobre la subida de tempo y los silencios'),
      ...seqBlocks,
      h(
        'div',
        { class: 'row wrap' },
        h('button', { type: 'button', class: 'btn small', onclick: () => update((p) => p.sequence.blocks.push({ bars: 4, bpm: 0, mode: 'full', sub: 0 })) }, icon(ICONS.plus, 16), 'Bloque'),
        select<string>(
          [{ value: '', label: 'Ejemplos…' }, ...examples.map((e, i) => ({ value: String(i), label: e.label }))],
          '',
          (v) => {
            const ex = examples[Number(v)];
            if (ex) update((p) => ((p.sequence.blocks = ex.blocks), (p.sequence.on = true)));
          },
          { 'aria-label': 'Cargar un ejemplo' },
        ),
      ),
      field(
        'Repeticiones',
        h(
          'div',
          { class: 'row wrap' },
          segmented(
            [0, 1, 2, 3, 4, 8].map((n) => ({ value: n, label: n === 0 ? 'Sin fin' : `${n}×` })),
            q.repeats,
            (v) => update((p) => (p.sequence.repeats = v)),
            'small',
            'Repeticiones de la secuencia',
          ),
        ),
      ),
      h(
        'p',
        { class: 'summary' },
        `${est.bars} compases por pasada, unos ${formatDuration(est.seconds)}`,
        q.repeats > 0 ? ` · en total ${formatDuration(est.seconds * q.repeats)}.` : ', en bucle.',
      ),
    );
  }

  root.append(
    live,
    h('div', { class: 'col' }, timerCard, rampCard),
    h('div', { class: 'col' }, gapCard, seqCard),
  );

  const renderAll = () => {
    renderLiveStatic();
    renderTimer();
    renderRamp();
    renderGap();
    renderSeq();
  };
  renderAll();

  app.store.subscribe((keys) => {
    if (keys.has('practice') || keys.has('all') || keys.has('meter') || keys.has('editor')) renderAll();
    else if (keys.has('bpm')) {
      if (app.state === 'stopped') {
        renderRamp();
        renderSeq();
        renderTimer();
      }
      updateLive();
    }
  });
  app.onTransport(() => {
    renderLiveStatic();
  });
  app.onFrame(() => {
    if (!live.isConnected || live.offsetParent === null) return;
    const now = performance.now();
    if (now - lastLive < 120) return;
    lastLive = now;
    updateLive();
  });

  return { el: root };
}
