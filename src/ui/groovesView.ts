import type { Controller } from '../app/controller';
import { INSTRUMENTS } from '../audio/sounds';
import { meterKey, pulsesPerBar, subdivisionLabel } from '../core/meter';
import type { Groove } from '../core/types';
import { LEVEL_NAMES, STYLES } from '../data/grooves';
import { ICONS, confirmDialog, h, icon, modal, prompt, segmented, toast } from './dom';
import type { View } from './metronomeView';

const ORDER = INSTRUMENTS.map((i) => i.id);
const SVG_NS = 'http://www.w3.org/2000/svg';

/** Miniatura del patrón: una fila por instrumento usado. */
function miniGrid(g: Groove): SVGSVGElement {
  const pulses = pulsesPerBar(g.meter);
  const p = g.pattern;
  const len = pulses * p.stepsPerBeat * p.bars;
  const rows = ORDER.filter((id) => p.tracks[id]?.some((l) => l > 0));
  const cw = 10;
  const rh = 8;
  const w = len * cw;
  const hgt = Math.max(1, rows.length) * rh;
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${w} ${hgt}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('class', 'mini');
  svg.setAttribute('aria-hidden', 'true');
  let out = '';
  for (let i = 0; i < len; i += p.stepsPerBeat) {
    if ((i / p.stepsPerBeat) % 2 === 1) out += `<rect class="mini-alt" x="${i * cw}" y="0" width="${p.stepsPerBeat * cw}" height="${hgt}"/>`;
  }
  rows.forEach((id, r) => {
    p.tracks[id].forEach((lv, i) => {
      if (lv > 0) out += `<rect class="mini-hit l${lv}" x="${i * cw + 1.5}" y="${r * rh + 1.5}" width="${cw - 3}" height="${rh - 3}" rx="1.5"/>`;
    });
  });
  svg.innerHTML = out;
  return svg;
}

export function groovesView(app: Controller): View {
  const root = h('section', { class: 'view view-grooves', 'aria-label': 'Biblioteca de grooves' });
  let filter = 'all';
  let level = 0;
  let query = '';

  const search = h('input', { type: 'search', class: 'text-input', placeholder: 'Buscar groove…', 'aria-label': 'Buscar groove' });
  search.addEventListener('input', () => {
    query = search.value.trim().toLowerCase();
    renderList();
  });

  const filters = h('div', { class: 'filters' });
  const list = h('div', { class: 'groove-list' });
  const playButtons = new Map<string, HTMLButtonElement>();

  function renderFilters() {
    const hasUser = app.store.state.library.user.length > 0;
    const opts = [
      { value: 'all', label: 'Todos' },
      { value: 'fav', label: 'Favoritos' },
      ...(hasUser ? [{ value: 'mine', label: 'Mis grooves' }] : []),
      ...STYLES.map((s) => ({ value: s, label: s })),
    ];
    if (filter === 'mine' && !hasUser) filter = 'all';
    filters.replaceChildren(
      segmented(opts, filter, (v) => {
        filter = v;
        renderFilters();
        renderList();
      }, 'wrap chips', 'Filtrar por estilo'),
      h(
        'div',
        { class: 'row wrap' },
        h('span', { class: 'muted' }, 'Nivel'),
        segmented(
          [0, 1, 2, 3].map((n) => ({ value: n, label: n ? LEVEL_NAMES[n] : 'Todos' })),
          level,
          (v) => {
            level = v;
            renderFilters();
            renderList();
          },
          'small',
          'Filtrar por nivel',
        ),
      ),
    );
  }

  function matches(g: Groove): boolean {
    const favs = app.store.state.library.favorites;
    if (filter === 'fav' && !favs.includes(g.id)) return false;
    if (filter === 'mine' && g.builtin) return false;
    if (!['all', 'fav', 'mine'].includes(filter) && g.style !== filter) return false;
    if (level && (g.level ?? 1) !== level) return false;
    if (query && !`${g.name} ${g.style} ${g.notes ?? ''} ${meterKey(g.meter)}`.toLowerCase().includes(query)) return false;
    return true;
  }

  function card(g: Groove): HTMLElement {
    const fav = app.store.state.library.favorites.includes(g.id);
    const playing = app.state === 'playing' && app.preview?.id === g.id;
    const play = h(
      'button',
      {
        type: 'button',
        class: `btn play-mini${playing ? ' on' : ''}`,
        'aria-label': `${playing ? 'Detener' : 'Escuchar'} ${g.name}`,
        onclick: () => app.togglePreview(g),
      },
      icon(playing ? ICONS.stop : ICONS.play, 18),
    );
    playButtons.set(g.id, play);

    const menu = () => {
      const actions = g.builtin
        ? [{ label: 'Guardar una copia en Mis grooves', run: () => toast(`Copiado: «${app.duplicateGroove(g).name}»`) }]
        : [
            { label: 'Renombrar', run: () => prompt('Renombrar groove', g.name, (v) => app.renameGroove(g.id, v)) },
            { label: 'Duplicar', run: () => toast(`Duplicado: «${app.duplicateGroove(g).name}»`) },
            {
              label: 'Eliminar',
              run: () => confirmDialog('Eliminar groove', `¿Eliminar «${g.name}»? No se puede deshacer.`, 'Eliminar', () => app.deleteGroove(g.id)),
            },
          ];
      const close = modal(
        g.name,
        h(
          'div',
          { class: 'menu-list' },
          actions.map((a) =>
            h('button', { type: 'button', class: 'btn menu-item', onclick: () => { close(); a.run(); } }, a.label),
          ),
        ),
        [{ label: 'Cerrar' }],
      );
    };

    return h(
      'article',
      { class: `groove${playing ? ' playing' : ''}` },
      h(
        'div',
        { class: 'groove-top' },
        play,
        h(
          'div',
          { class: 'groove-info' },
          h('h3', null, g.name),
          h(
            'div',
            { class: 'groove-meta' },
            h('span', { class: 'tag' }, g.style),
            g.builtin ? h('span', { class: `lvl-tag l${g.level ?? 1}` }, LEVEL_NAMES[g.level ?? 1]) : null,
            h('span', null, `${g.bpm} BPM`),
            h('span', null, meterKey(g.meter)),
            h('span', null, subdivisionLabel(g.meter, g.pattern.stepsPerBeat).toLowerCase()),
            g.pattern.swing.amount > 0.5 ? h('span', null, `swing ${Math.round(g.pattern.swing.amount * 100)} %`) : null,
            g.pattern.bars > 1 ? h('span', null, `${g.pattern.bars} compases`) : null,
          ),
        ),
        h(
          'button',
          {
            type: 'button',
            class: `btn icon-btn ghost fav${fav ? ' on' : ''}`,
            'aria-pressed': String(fav),
            'aria-label': fav ? 'Quitar de favoritos' : 'Añadir a favoritos',
            onclick: () => app.toggleFavorite(g.id),
          },
          icon(fav ? ICONS.starFill : ICONS.star, 20),
        ),
      ),
      miniGrid(g),
      g.notes ? h('p', { class: 'groove-notes' }, g.notes) : null,
      h(
        'div',
        { class: 'groove-actions' },
        h('button', { type: 'button', class: 'btn small', onclick: () => app.loadIntoEditor(g) }, icon(ICONS.edit, 16), 'Abrir en el beat maker'),
        h('button', { type: 'button', class: 'btn small ghost icon-btn', 'aria-label': 'Más opciones', onclick: menu }, icon(ICONS.more, 18)),
      ),
    );
  }

  function renderList() {
    playButtons.clear();
    const items = app.allGrooves().filter(matches);
    if (!items.length) {
      list.replaceChildren(
        h('p', { class: 'empty' }, filter === 'fav' ? 'Aún no tienes favoritos. Pulsa la estrella de un groove para guardarlo aquí.' : 'No hay grooves que coincidan.'),
      );
      return;
    }
    list.replaceChildren(...items.map(card));
  }

  function syncPlaying() {
    for (const [id, btn] of playButtons) {
      const playing = app.state === 'playing' && app.preview?.id === id;
      if (btn.classList.contains('on') === playing) continue;
      btn.classList.toggle('on', playing);
      btn.replaceChildren(icon(playing ? ICONS.stop : ICONS.play, 18));
      btn.closest('.groove')?.classList.toggle('playing', playing);
    }
  }

  root.append(
    h('div', { class: 'panel lib-head' }, h('div', { class: 'lib-title' }, h('h2', null, 'Grooves'), h('span', { class: 'muted' }, `${app.allGrooves().length} patrones`)), search, filters),
    list,
  );
  renderFilters();
  renderList();

  app.store.subscribe((keys) => {
    if (keys.has('library') || keys.has('all')) {
      (root.querySelector('.lib-title .muted') as HTMLElement).textContent = `${app.allGrooves().length} patrones`;
      renderFilters();
      renderList();
    }
  });
  app.onTransport(syncPlaying);

  return { el: root };
}
