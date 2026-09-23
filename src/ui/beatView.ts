import type { Controller } from '../app/controller';
import { INSTRUMENTS, SOUND_MAP, soundLabel } from '../audio/sounds';
import { beatStepOptions, countLabels, isCompound, pulsesPerBar, subdivisionLabel } from '../core/meter';
import { isPatternEmpty } from '../core/patterns';
import type { InstrumentId, Level } from '../core/types';
import { STYLES } from '../data/grooves';
import { ICONS, h, icon, modal, range, segmented, select, toast, toggle } from './dom';
import { meterPicker, swingControl, type View } from './metronomeView';
import { Visualizer, type VizLayer } from './viz';
import { POLY_COLORS } from '../app/controller';

const INSTRUMENT_ORDER = INSTRUMENTS.map((i) => i.id);
/** Nombres compactos para la columna de la cuadrícula */
const ROW_NAMES: Record<string, string> = { hhc: 'HH cerrado', hho: 'HH abierto', hhp: 'HH pedal' };
const rowName = (id: string) => ROW_NAMES[id] ?? soundLabel(id);

export function beatView(app: Controller): View {
  const st = () => app.store.state;
  const ed = () => app.store.state.editor;
  const root = h('section', { class: 'view view-beat', 'aria-label': 'Beat maker' });

  let brush: Level = 2;
  let barView: number | 'all' = window.innerWidth >= 1000 ? 'all' : 0;

  /* ---------- cabecera ---------- */
  const head = h('div', { class: 'panel beat-head' });
  const undoBtn = h('button', { type: 'button', class: 'btn', title: 'Deshacer', onclick: () => app.undo() }, icon(ICONS.undo, 18), h('span', null, 'Deshacer'));

  function renderHead() {
    const e = ed();
    const name = h('input', { type: 'text', class: 'text-input name-input', value: e.name, maxlength: 80, 'aria-label': 'Nombre del groove' });
    name.addEventListener('change', () => app.updateEditor((x) => (x.name = name.value.trim() || 'Sin nombre'), false));
    const styles = [...new Set(['Mis grooves', ...STYLES, e.style])];
    head.replaceChildren(
      h(
        'div',
        { class: 'beat-title' },
        name,
        select<string>(styles.map((v) => ({ value: v, label: v })), e.style, (v) => app.updateEditor((x) => (x.style = v), false), { 'aria-label': 'Estilo' }),
      ),
      h(
        'div',
        { class: 'row wrap' },
        h('button', {
          type: 'button', class: 'btn primary',
          onclick: () => {
            const g = app.saveEditor();
            toast(`«${g.name}» guardado en Mis grooves`);
          },
        }, e.grooveId ? 'Guardar' : 'Guardar en Mis grooves'),
        e.grooveId
          ? h('button', { type: 'button', class: 'btn', onclick: () => toast(`Copia guardada: «${app.saveEditor(true).name}»`) }, 'Guardar como nuevo')
          : null,
        h('button', {
          type: 'button', class: 'btn',
          onclick: () => {
            const had = !isPatternEmpty(ed().pattern);
            app.newGroove();
            if (had) toast('Cuadrícula vacía', { label: 'Deshacer', onClick: () => app.undo() });
          },
        }, 'Nuevo'),
        undoBtn,
      ),
    );
    undoBtn.disabled = !app.canUndo;
  }

  /* ---------- ajustes del patrón ---------- */
  const opts = h('div', { class: 'panel beat-opts' });

  function renderOpts() {
    const e = ed();
    const p = e.pattern;
    const binary = !isCompound(e.meter) && [2, 4].includes(p.stepsPerBeat);
    opts.replaceChildren(
      h('div', { class: 'opt-block' }, h('h3', null, 'Compás'), meterPicker(e.meter, (meter) => app.resizeEditor({ meter }))),
      h(
        'div',
        { class: 'opt-block' },
        h('h3', null, 'Resolución'),
        segmented(
          beatStepOptions(e.meter).map((n) => ({ value: n, label: subdivisionLabel(e.meter, n), title: `${n} pasos por pulso` })),
          p.stepsPerBeat,
          (n) => app.resizeEditor({ stepsPerBeat: n }),
          'wrap',
          'Resolución',
        ),
        h('h3', null, 'Compases'),
        segmented([1, 2, 3, 4, 8].map((n) => ({ value: n, label: String(n) })), p.bars, (bars) => {
          app.resizeEditor({ bars });
          if (barView !== 'all' && barView >= bars) barView = 0;
        }, '', 'Número de compases'),
      ),
      h(
        'div',
        { class: 'opt-block' },
        binary
          ? swingControl(p.swing, (sw) => app.updateEditor((x) => (x.pattern.swing = sw)))
          : h('p', { class: 'hint' }, 'El swing se aplica a resoluciones binarias (corcheas o semicorcheas) en compases simples.'),
        h(
          'div',
          { class: 'toggles' },
          toggle('Repetir en bucle', st().loop, (v) => app.store.update('loop', (s) => (s.loop = v))),
          toggle('Click del metrónomo', st().beatClick, (v) => app.store.update('beatClick', (s) => (s.beatClick = v)), 'Usa los sonidos y la subdivisión del metrónomo'),
        ),
      ),
    );
  }

  /* ---------- cuadrícula ---------- */
  const gridPanel = h('div', { class: 'panel beat-grid-panel' });
  let cellMap = new Map<InstrumentId, Map<number, HTMLButtonElement>>();
  let cols = new Map<number, HTMLElement[]>();
  let playCol = -1;
  let barTabs: HTMLButtonElement[] = [];
  let playingBar = -1;

  const shownRows = (): InstrumentId[] => {
    const e = ed();
    const set = new Set(e.visible);
    for (const [id, t] of Object.entries(e.pattern.tracks)) if (t.some((l) => l > 0)) set.add(id);
    return INSTRUMENT_ORDER.filter((id) => set.has(id));
  };

  function levelAt(inst: InstrumentId, i: number): Level {
    return ed().pattern.tracks[inst]?.[i] ?? 0;
  }

  function renderGrid() {
    const e = ed();
    const p = e.pattern;
    const pulses = pulsesPerBar(e.meter);
    const per = pulses * p.stepsPerBeat;
    if (barView !== 'all' && barView >= p.bars) barView = 0;
    const from = barView === 'all' ? 0 : barView * per;
    const to = barView === 'all' ? per * p.bars : from + per;
    const labels = countLabels(e.meter, p.stepsPerBeat);
    const mixer = st().mixer;

    cellMap = new Map();
    cols = new Map();
    playCol = -1;

    const addCol = (i: number, el: HTMLElement) => {
      const list = cols.get(i);
      if (list) list.push(el);
      else cols.set(i, [el]);
    };

    const stepClass = (i: number) => {
      const inBar = i % per;
      const pulse = Math.floor(inBar / p.stepsPerBeat);
      return `${inBar % p.stepsPerBeat === 0 ? ' beat-start' : ''}${inBar === 0 ? ' bar-start' : ''}${pulse % 2 ? ' alt' : ''}`;
    };

    const header = h('div', { class: 'brow bhead', 'aria-hidden': 'true' }, h('div', { class: 'blabel' }));
    for (let i = from; i < to; i++) {
      const inBar = i % per;
      const txt = inBar === 0 && barView === 'all' && p.bars > 1 ? `${Math.floor(i / per) + 1}·1` : labels[inBar];
      const c = h('div', { class: `bnum${stepClass(i)}` }, txt);
      header.append(c);
      addCol(i, c);
    }

    const rows = shownRows().map((inst) => {
      const muted = mixer[inst]?.mute ?? false;
      const map = new Map<number, HTMLButtonElement>();
      cellMap.set(inst, map);
      const row = h(
        'div',
        { class: `brow${muted ? ' muted' : ''}`, 'data-inst': inst },
        h(
          'div',
          { class: 'blabel' },
          h('button', { type: 'button', class: 'bname', title: `${soundLabel(inst)}: toca para escuchar`, onclick: () => app.audio.preview(inst) }, rowName(inst)),
          h(
            'button',
            {
              type: 'button',
              class: `bmute${muted ? ' on' : ''}`,
              'aria-pressed': String(muted),
              'aria-label': `${muted ? 'Activar' : 'Silenciar'} ${soundLabel(inst)}`,
              title: 'Silenciar',
              onclick: () => app.setChannel(inst, { mute: !muted }),
            },
            icon(muted ? ICONS.mute : ICONS.speaker, 16),
          ),
        ),
      );
      for (let i = from; i < to; i++) {
        const lv = levelAt(inst, i);
        const c = h('button', {
          type: 'button',
          class: `bcell lvl-${lv}${stepClass(i)}`,
          'data-i': i,
          'aria-label': `${soundLabel(inst)}, paso ${i + 1}`,
          'aria-pressed': String(lv > 0),
        });
        map.set(i, c);
        addCol(i, c);
        row.append(c);
      }
      return row;
    });

    const grid = h('div', { class: 'bgrid', style: `--cols:${to - from}` }, header, rows);
    attachPainting(grid);

    barTabs = [];
    const tabs =
      p.bars > 1
        ? h(
            'div',
            { class: 'seg bar-tabs', role: 'tablist', 'aria-label': 'Compás visible' },
            [{ v: 'all' as const, l: 'Todos' }, ...Array.from({ length: p.bars }, (_, b) => ({ v: b, l: `Compás ${b + 1}` }))].map((o) => {
              const b = h('button', {
                type: 'button',
                role: 'tab',
                class: barView === o.v ? 'on' : '',
                'aria-selected': String(barView === o.v),
                onclick: () => {
                  barView = o.v;
                  renderGrid();
                },
              }, o.l);
              if (o.v !== 'all') barTabs[o.v] = b;
              return b;
            }),
          )
        : null;

    const brushSeg = segmented<number>(
      [
        { value: 2, label: 'Normal' },
        { value: 3, label: 'Acento' },
        { value: 1, label: 'Ghost' },
      ],
      brush,
      (v) => {
        brush = v as Level;
        renderGrid();
      },
      `small brush brush-${brush}`,
      'Intensidad al tocar',
    );

    const barActions =
      barView !== 'all'
        ? [
            barView > 0
              ? h('button', { type: 'button', class: 'btn small ghost', onclick: () => app.copyBar((barView as number) - 1, barView as number) }, 'Copiar compás anterior')
              : null,
            h('button', { type: 'button', class: 'btn small ghost', onclick: () => app.clearBars(barView as number) }, 'Vaciar compás'),
          ]
        : [];

    gridPanel.replaceChildren(
      h(
        'div',
        { class: 'panel-head' },
        h('div', { class: 'row wrap' }, h('span', { class: 'muted' }, 'Tocar con'), brushSeg),
        tabs,
      ),
      h('div', { class: 'grid-scroll' }, grid),
      h(
        'div',
        { class: 'row wrap grid-foot' },
        h('button', { type: 'button', class: 'btn small', onclick: openInstruments }, icon(ICONS.plus, 16), 'Instrumentos'),
        ...barActions,
        h('button', {
          type: 'button', class: 'btn small ghost',
          onclick: () => {
            app.clearBars(null);
            toast('Patrón vaciado', { label: 'Deshacer', onClick: () => app.undo() });
          },
        }, 'Vaciar todo'),
      ),
    );
    if (app.state === 'playing' && app.mode === 'beat') {
      markPlay(app.current.beatStep);
      markBar(app.current.beatStep);
    } else {
      playingBar = -1;
    }
  }

  let lastPointer = '';
  let painting: Level | null = null;
  window.addEventListener('pointerup', () => (painting = null));
  window.addEventListener('pointercancel', () => (painting = null));

  function attachPainting(grid: HTMLElement) {

    const cellFrom = (target: EventTarget | null) => (target as HTMLElement | null)?.closest?.<HTMLButtonElement>('.bcell') ?? null;
    const instOf = (cell: HTMLElement) => cell.parentElement?.dataset.inst ?? '';

    const hit = (cell: HTMLButtonElement, value: Level | null, record: boolean): Level => {
      const inst = instOf(cell);
      const i = Number(cell.dataset.i);
      const next = value ?? (levelAt(inst, i) === brush ? 0 : brush);
      app.setBeatCell(inst, i, next, record);
      if (next > 0 && app.state !== 'playing') app.audio.preview(inst, [0, 0.3, 0.74, 1][next]);
      return next;
    };

    grid.addEventListener('pointerdown', (e) => {
      lastPointer = e.pointerType;
      const cell = cellFrom(e.target);
      if (!cell || e.pointerType !== 'mouse' || e.button !== 0) return;
      e.preventDefault();
      painting = hit(cell, null, true);
    });
    grid.addEventListener('pointermove', (e) => {
      if (painting === null || e.pointerType !== 'mouse') return;
      const cell = cellFrom(document.elementFromPoint(e.clientX, e.clientY));
      if (cell && grid.contains(cell)) {
        const inst = instOf(cell);
        if (levelAt(inst, Number(cell.dataset.i)) !== painting) hit(cell, painting, false);
      }
    });
    grid.addEventListener('click', (e) => {
      const cell = cellFrom(e.target);
      if (!cell) return;
      // Ratón: ya se ha aplicado en pointerdown. Táctil y teclado: se aplica aquí.
      if (e.detail !== 0 && lastPointer === 'mouse') return;
      hit(cell, null, true);
    });
  }

  function syncCells() {
    for (const [inst, map] of cellMap) {
      for (const [i, c] of map) {
        const lv = levelAt(inst, i);
        const cls = `lvl-${lv}`;
        if (!c.classList.contains(cls)) {
          c.classList.remove('lvl-0', 'lvl-1', 'lvl-2', 'lvl-3');
          c.classList.add(cls);
          c.setAttribute('aria-pressed', String(lv > 0));
        }
      }
    }
    // Si se ha añadido una nota a una fila oculta, hay que redibujar
    if (shownRows().length !== cellMap.size) renderGrid();
    undoBtn.disabled = !app.canUndo;
  }

  function markPlay(step: number) {
    if (playCol >= 0) for (const c of cols.get(playCol) ?? []) c.classList.remove('play');
    playCol = step;
    if (step >= 0) for (const c of cols.get(step) ?? []) c.classList.add('play');
  }

  function markBar(step: number) {
    const e = ed();
    const per = pulsesPerBar(e.meter) * e.pattern.stepsPerBeat;
    const bar = step >= 0 ? Math.floor(step / per) : -1;
    if (bar === playingBar) return;
    barTabs[playingBar]?.classList.remove('playing');
    playingBar = bar;
    barTabs[bar]?.classList.add('playing');
  }

  function openInstruments() {
    const e = ed();
    const used = new Set(Object.entries(e.pattern.tracks).filter(([, t]) => t.some((l) => l > 0)).map(([id]) => id));
    const list = h(
      'div',
      { class: 'inst-list' },
      INSTRUMENTS.map((inst) => {
        const hasNotes = used.has(inst.id);
        const box = h('input', {
          type: 'checkbox',
          checked: ed().visible.includes(inst.id) || hasNotes,
          disabled: hasNotes,
          onchange: () =>
            app.updateEditor((x) => {
              x.visible = box.checked ? [...new Set([...x.visible, inst.id])] : x.visible.filter((v) => v !== inst.id);
            }, false),
        });
        return h(
          'div',
          { class: 'inst-item' },
          h('label', null, box, inst.label),
          hasNotes
            ? h('button', {
                type: 'button', class: 'btn small ghost',
                onclick: () => {
                  app.updateEditor((x) => delete x.pattern.tracks[inst.id]);
                  box.disabled = false;
                  (box.nextSibling as Text).textContent = inst.label;
                  toast(`Fila de ${inst.label.toLowerCase()} vaciada`, { label: 'Deshacer', onClick: () => app.undo() });
                },
              }, 'Vaciar')
            : null,
        );
      }),
    );
    modal('Instrumentos visibles', [h('p', { class: 'hint' }, 'Los instrumentos con notas siempre se muestran.'), list], [{ label: 'Hecho', primary: true }]);
  }

  /* ---------- mezclador ---------- */
  const mixer = h('details', { class: 'panel mixer' });
  function renderMixer() {
    const open = mixer.open;
    const s = st();
    // Mientras se arrastra solo cambia el audio; el estado se guarda al soltar (evita redibujar el control).
    const vol = (key: 'beat' | 'metronome', label: string) => {
      const live = (v: number) => {
        const cur = { ...s.volumes, [key]: v };
        app.audio.setVolumes(cur.master, cur.metronome, cur.beat);
      };
      const el = range(s.volumes[key], 0, 1.5, 0.01, live, { 'aria-label': label });
      el.addEventListener('change', () => app.store.update('volumes', (x) => (x.volumes[key] = Number(el.value))));
      return h('div', { class: 'mix-row' }, h('span', { class: 'mix-name' }, label), el);
    };
    mixer.replaceChildren(
      h('summary', null, h('h3', null, 'Mezclador')),
      vol('beat', 'Beat (general)'),
      vol('metronome', 'Click'),
      h('hr'),
      ...shownRows().map((id) => {
        const ch = s.mixer[id] ?? { vol: 1, mute: false };
        const slider = range(ch.vol, 0, 1.5, 0.01, (v) => app.audio.setChannel(id, v, ch.mute), { 'aria-label': `Volumen ${soundLabel(id)}` });
        slider.addEventListener('change', () => app.setChannel(id, { vol: Number(slider.value) }));
        return h(
          'div',
          { class: `mix-row${ch.mute ? ' muted' : ''}` },
          h('span', { class: 'mix-name' }, SOUND_MAP.get(id)?.label ?? id),
          slider,
          h('button', {
            type: 'button',
            class: `bmute${ch.mute ? ' on' : ''}`,
            'aria-pressed': String(ch.mute),
            'aria-label': 'Silenciar',
            onclick: () => app.setChannel(id, { mute: !ch.mute }),
          }, icon(ch.mute ? ICONS.mute : ICONS.speaker, 16)),
        );
      }),
    );
    mixer.open = open;
  }

  /* ---------- vista circular ---------- */
  const viz = new Visualizer('circle');
  const vizPanel = h('details', { class: 'panel viz-panel' }, h('summary', null, h('h3', null, 'Visualizador')), viz.el);
  const ROW_COLORS = ['var(--brass)', 'var(--steel)', ...POLY_COLORS];
  /** Para cada instrumento: índice del golpe en la capa por paso del patrón */
  let vizIndex = new Map<InstrumentId, Map<number, number>>();
  let vizLen = 1;

  function renderViz() {
    if (!vizPanel.open) return;
    const e = ed();
    const pulses = pulsesPerBar(e.meter);
    vizLen = pulses * e.pattern.stepsPerBeat * e.pattern.bars;
    vizIndex = new Map();
    const layers: VizLayer[] = [];
    shownRows().forEach((inst) => {
      const t = e.pattern.tracks[inst];
      if (!t?.some((l) => l > 0)) return;
      const idx = new Map<number, number>();
      const positions: number[] = [];
      const levels: number[] = [];
      t.forEach((lv, i) => {
        if (lv > 0) {
          idx.set(i, positions.length);
          positions.push(i / vizLen);
          levels.push(lv);
        }
      });
      vizIndex.set(inst, idx);
      layers.push({
        key: inst,
        label: rowName(inst),
        color: ROW_COLORS[layers.length % ROW_COLORS.length],
        positions,
        levels,
        ticks: layers.length === 0 ? pulses * e.pattern.bars : 0,
        muted: st().mixer[inst]?.mute,
      });
    });
    viz.setLayers(layers);
  }
  vizPanel.addEventListener('toggle', renderViz);

  root.append(head, opts, gridPanel, vizPanel, mixer);
  renderHead();
  renderOpts();
  renderGrid();
  renderMixer();
  renderViz();

  app.store.subscribe((keys) => {
    const all = keys.has('all');
    if (all || keys.has('editor')) {
      renderHead();
      renderOpts();
      renderGrid();
      renderMixer();
      renderViz();
      return;
    }
    if (keys.has('cell')) {
      syncCells();
      renderViz();
    }
    if (keys.has('library')) renderHead();
    if (keys.has('loop') || keys.has('beatClick')) renderOpts();
    if (keys.has('mixer')) {
      renderGrid();
      renderMixer();
      renderViz();
    } else if (keys.has('volumes')) {
      renderMixer();
    }
  });

  app.onTick((e) => {
    if (e.kind !== 'beat' || app.mode !== 'beat' || app.preview) return;
    markPlay(e.mode === 'silent' ? -1 : e.step);
    markBar(e.step);
    if (vizPanel.open && e.mode !== 'silent') {
      for (const [inst, idx] of vizIndex) {
        const k = idx.get(e.step);
        if (k !== undefined) viz.hit(inst, k);
      }
    }
  });
  app.onFrame((ph) => {
    if (!vizPanel.open || !viz.visible) return;
    if (!ph || app.mode !== 'beat' || app.preview) {
      viz.frame(null, '');
      return;
    }
    const e = ed();
    const cycle = ph.pulses * e.pattern.bars;
    viz.frame((ph.pulse % cycle) / cycle, String(Math.floor(ph.pulse % ph.pulses) + 1));
  });
  app.onTransport(() => {
    if (app.state !== 'playing') {
      markPlay(-1);
      markBar(-1);
    }
  });

  return { el: root };
}
