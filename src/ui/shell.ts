import type { Controller } from '../app/controller';
import { meterKey, pulsesPerBar } from '../core/meter';
import type { Action, Tab } from '../core/types';
import { beatView } from './beatView';
import { ICONS, h, icon, isTyping, repeatButton } from './dom';
import { groovesView } from './groovesView';
import { metronomeView } from './metronomeView';
import { openTimerModal, practiceView } from './practiceView';
import { normalizeKey, settingsView } from './settingsView';
import { toast } from './dom';
import { formatClock, isPracticeActive, sequenceActive, timerLimit } from '../core/practice';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'metronome', label: 'Metrónomo', icon: ICONS.metronome },
  { id: 'beat', label: 'Beat maker', icon: ICONS.grid },
  { id: 'grooves', label: 'Grooves', icon: ICONS.library },
  { id: 'practice', label: 'Práctica', icon: ICONS.practice },
  { id: 'settings', label: 'Ajustes', icon: ICONS.settings },
];

export function mountApp(app: Controller, host: HTMLElement): void {
  const st = () => app.store.state;
  const views: Record<Tab, HTMLElement> = {
    metronome: metronomeView(app).el,
    beat: beatView(app).el,
    grooves: groovesView(app).el,
    practice: practiceView(app).el,
    settings: settingsView(app).el,
  };

  /* ---- navegación ---- */
  const tabButtons = TABS.map((t) =>
    h(
      'button',
      { type: 'button', class: 'tab', 'data-tab': t.id, onclick: () => app.store.update('tab', (s) => (s.tab = t.id)) },
      icon(t.icon, 22),
      h('span', null, t.label),
    ),
  );
  const nav = h('nav', { class: 'tabs', 'aria-label': 'Secciones' }, tabButtons);

  /* ---- transporte ---- */
  const playBtn = h('button', { type: 'button', class: 'btn play', onclick: () => app.toggle() });
  const stopBtn = h('button', { type: 'button', class: 'btn stop', 'aria-label': 'Parar', title: 'Parar (R)', onclick: () => app.reset() }, icon(ICONS.stop, 20));
  const bpmOut = h('div', { class: 'tp-bpm' });
  const what = h('div', { class: 'tp-what' });
  const pos = h('div', { class: 'tp-pos', 'aria-live': 'off' });
  const timerOut = h('span');
  const timerBtn = h(
    'button',
    { type: 'button', class: 'tp-timer', title: 'Temporizador', onclick: () => openTimerModal(app) },
    icon(ICONS.clock, 16),
    timerOut,
  );
  const practiceBadge = h('button', {
    type: 'button', class: 'tp-badge', title: 'Modo práctica activo',
    onclick: () => app.store.update('tab', (s) => (s.tab = 'practice')),
  }, 'Práctica');
  const beatDots = h('div', { class: 'tp-dots', 'aria-hidden': 'true' });
  let dots: HTMLElement[] = [];

  const transport = h(
    'div',
    { class: 'transport', role: 'region', 'aria-label': 'Reproducción' },
    h('div', { class: 'tp-info' }, what, beatDots, practiceBadge, pos, timerBtn),
    h(
      'div',
      { class: 'tp-controls' },
      repeatButton('−', () => app.nudge(-1), { class: 'btn tp-nudge', 'aria-label': 'Bajar 1 BPM' }),
      bpmOut,
      repeatButton('+', () => app.nudge(1), { class: 'btn tp-nudge', 'aria-label': 'Subir 1 BPM' }),
      stopBtn,
      playBtn,
    ),
  );

  const header = h(
    'header',
    { class: 'topbar' },
    h('div', { class: 'brand' }, h('span', { class: 'brand-mark', 'aria-hidden': 'true' }), 'Baketa'),
    nav,
  );
  const main = h('main', { class: 'main' }, Object.values(views));
  const flash = h('div', { class: 'flash', 'aria-hidden': 'true' });
  host.replaceChildren(h('div', { class: 'app' }, header, main, transport), flash);

  /* ---- sincronización ---- */
  function context(): { label: string; pulses: number } {
    const s = st();
    // Si suena algo, se muestra lo que suena; si no, lo que sonará al pulsar play aquí
    const ctx = app.state !== 'stopped' ? { mode: app.mode, preview: app.preview } : app.contextFor(s.tab);
    if (ctx.mode === 'beat') {
      const meter = ctx.preview ? ctx.preview.meter : s.editor.meter;
      const name = ctx.preview ? ctx.preview.name : s.editor.name;
      return { label: `${name} · ${meterKey(meter)}`, pulses: pulsesPerBar(meter) };
    }
    const poly = s.metronome.poly;
    const extra = poly.on && poly.layers.length ? ` · ${poly.layers.map((l) => l.n).join(':')}:${pulsesPerBar(s.meter)}` : '';
    return { label: `Metrónomo · ${meterKey(s.meter)}${extra}`, pulses: pulsesPerBar(s.meter) };
  }

  function syncTimer() {
    const s = st();
    const lim = timerLimit(s.practice.timer);
    timerBtn.classList.toggle('on', s.practice.timer.on);
    practiceBadge.hidden = !isPracticeActive(s.practice) || (!sequenceActive(s.practice) && !s.practice.ramp.on && !s.practice.gap.on);
    if (!s.practice.timer.on) {
      timerOut.textContent = '';
      return;
    }
    const ph = app.phase();
    if (lim.seconds) timerOut.textContent = formatClock(lim.seconds - (ph?.elapsed ?? 0));
    else timerOut.textContent = `${ph ? Math.min(lim.bars, ph.bar + 1) : 0}/${lim.bars}`;
  }

  function renderInfo() {
    const c = context();
    what.textContent = c.label;
    if (dots.length !== c.pulses) {
      dots = Array.from({ length: c.pulses }, () => h('span'));
      beatDots.replaceChildren(...dots);
    }
    // El botón muestra pausa solo si lo que suena es lo de esta sección
    const playing = app.state === 'playing' && app.isContext(st().tab);
    playBtn.replaceChildren(icon(playing ? ICONS.pause : ICONS.play, 30));
    playBtn.setAttribute('aria-label', playing ? 'Pausa' : 'Reproducir');
    playBtn.title = `${playing ? 'Pausa' : 'Reproducir'} (Espacio)`;
    playBtn.classList.toggle('on', playing);
    stopBtn.disabled = app.state === 'stopped';
    if (app.state === 'stopped') {
      pos.textContent = '';
      dots.forEach((d) => d.classList.remove('on', 'accent'));
    }
    syncTimer();
  }

  function syncBpm() {
    bpmOut.replaceChildren(h('b', null, String(st().bpm)), h('small', null, 'BPM'));
  }

  function syncTab() {
    const tab = st().tab;
    for (const [id, el] of Object.entries(views)) el.hidden = id !== tab;
    tabButtons.forEach((b) => {
      const on = b.dataset.tab === tab;
      b.classList.toggle('on', on);
      if (on) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    });
    renderInfo();
  }

  function applyTheme() {
    document.documentElement.dataset.theme = st().settings.theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', st().settings.theme === 'light' ? '#eef1f5' : '#161a22');
  }

  let lastPulse = -1;
  app.onTick((e) => {
    // Un solo reloj visual para los puntos: el pulso
    if (e.kind !== 'pulse') return;
    if (e.pulse !== lastPulse || e.pulse === 0) {
      dots.forEach((d, i) => {
        d.classList.toggle('on', i === e.pulse && e.mode !== 'silent');
        d.classList.toggle('accent', i === 0 && e.pulse === 0 && e.mode !== 'silent');
      });
      lastPulse = e.pulse;
    }
    pos.textContent = `Compás ${e.bar + 1}${e.mode === 'silent' ? ' · silencio' : ''}`;
    if (e.pulse === 0 && st().settings.flash && e.mode !== 'silent') {
      flash.classList.remove('go');
      void flash.offsetWidth;
      flash.classList.add('go');
    }
  });
  app.onTransport(() => {
    renderInfo();
    const reasons: Record<string, string> = {
      timer: 'Temporizador: tiempo cumplido',
      sequence: 'Secuencia terminada',
      ramp: 'Subida de tempo completada',
    };
    if (app.state === 'stopped' && app.lastEnd && reasons[app.lastEnd]) {
      toast(reasons[app.lastEnd]);
      app.lastEnd = null;
    }
  });
  let lastTimerSync = 0;
  app.onFrame(() => {
    const now = performance.now();
    if (now - lastTimerSync > 200) {
      lastTimerSync = now;
      if (st().practice.timer.on) syncTimer();
    }
  });

  app.store.subscribe((keys) => {
    const all = keys.has('all');
    if (all || keys.has('tab')) {
      syncTab();
      main.scrollTop = 0;
    }
    if (all || keys.has('bpm')) syncBpm();
    if (all || keys.has('settings')) applyTheme();
    if (all || keys.has('meter') || keys.has('editor') || keys.has('practice') || keys.has('metronome')) renderInfo();
  });

  /* ---- teclado ---- */
  document.addEventListener('keydown', (e) => {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
    if (document.querySelector('.overlay') || isTyping(e.target)) return;
    const key = normalizeKey(e.key);
    const keys = st().settings.keys;
    const action = (Object.keys(keys) as Action[]).find((a) => keys[a] && keys[a] === key);
    if (!action) return;
    if (e.key === ' ' || e.key.startsWith('Arrow')) {
      // No desplazar la página ni activar el botón con el foco
      if ((e.target as HTMLElement).tagName === 'INPUT' && (e.target as HTMLInputElement).type === 'range') return;
    }
    e.preventDefault();
    if (e.repeat && (action === 'playPause' || action === 'tap' || action === 'reset')) return;
    const step = e.shiftKey ? 5 : 1;
    switch (action) {
      case 'playPause':
        (document.activeElement as HTMLElement | null)?.blur?.();
        app.toggle();
        break;
      case 'bpmUp':
        app.nudge(step);
        break;
      case 'bpmDown':
        app.nudge(-step);
        break;
      case 'tap':
        app.tap();
        break;
      case 'reset':
        app.reset();
        break;
    }
  });

  // Desbloqueo temprano del audio en el primer gesto (móviles)
  const warm = () => {
    void app.audio.init();
    window.removeEventListener('pointerdown', warm, true);
    window.removeEventListener('keydown', warm, true);
  };
  window.addEventListener('pointerdown', warm, true);
  window.addEventListener('keydown', warm, true);

  /**
   * Botón "atrás" de Android (lo llama MainActivity a través del WebView).
   * Devuelve true si la app ha gestionado la acción; false para salir.
   * En el navegador nadie lo llama, así que no cambia nada.
   */
  (window as unknown as { baketaHandleBack: () => boolean }).baketaHandleBack = () => {
    if (document.querySelector('.overlay')) {
      // El diálogo ya sabe cerrarse con Escape (y así limpia sus listeners)
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      return true;
    }
    if (st().tab !== 'metronome') {
      app.store.update('tab', (s) => (s.tab = 'metronome'));
      return true;
    }
    return false;
  };

  applyTheme();
  syncBpm();
  syncTab();
}
