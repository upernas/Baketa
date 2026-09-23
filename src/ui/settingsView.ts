import type { Controller } from '../app/controller';
import { pulsesPerBar } from '../core/meter';
import { trackToString } from '../core/patterns';
import { DEFAULT_KEYS, STATE_VERSION, defaultState, hydrate, sanitizeGroove } from '../core/store';
import type { Action, Groove } from '../core/types';
import { confirmDialog, field, h, modal, range, segmented, toast, toggle } from './dom';
import type { View } from './metronomeView';

export const ACTION_LABELS: Record<Action, string> = {
  playPause: 'Reproducir / pausa',
  bpmUp: 'Subir 1 BPM (con Mayús: 5)',
  bpmDown: 'Bajar 1 BPM (con Mayús: 5)',
  tap: 'Tap tempo',
  reset: 'Parar y volver al inicio',
};

export function keyLabel(k: string): string {
  const map: Record<string, string> = {
    ' ': 'Espacio', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Enter: 'Intro',
  };
  if (!k) return '—';
  return map[k] ?? (k.length === 1 ? k.toUpperCase() : k);
}

export const normalizeKey = (k: string): string => (k.length === 1 ? k.toLowerCase() : k);

/** Grooves exportados con las pistas como texto legible (X x g .). */
function exportGroove(g: Groove) {
  const per = pulsesPerBar(g.meter) * g.pattern.stepsPerBeat;
  const tracks: Record<string, string> = {};
  for (const [id, t] of Object.entries(g.pattern.tracks)) if (t.some((l) => l > 0)) tracks[id] = trackToString(t, per);
  return { ...g, builtin: undefined, pattern: { ...g.pattern, tracks } };
}

function copyText(text: string, area: HTMLTextAreaElement): void {
  const done = () => toast('Copiado al portapapeles');
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).then(done, () => {
      area.select();
      toast('Selecciona el texto y cópialo manualmente');
    });
  } else {
    area.select();
    toast('Selecciona el texto y cópialo manualmente');
  }
}

function download(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = h('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function settingsView(app: Controller): View {
  const st = () => app.store.state;
  const root = h('section', { class: 'view view-settings', 'aria-label': 'Ajustes' });
  let capturing: Action | null = null;

  function openExport() {
    let kind: 'all' | 'grooves' | 'editor' = 'all';
    const area = h('textarea', { class: 'json', rows: 10, readonly: true, spellcheck: 'false', 'aria-label': 'Datos exportados' });
    const build = () => {
      const s = st();
      const date = new Date().toISOString();
      const data =
        kind === 'all'
          ? { app: 'baketa', type: 'backup', version: STATE_VERSION, date, state: { ...s, library: { ...s.library, user: s.library.user.map(exportGroove) } } }
          : {
              app: 'baketa',
              type: 'grooves',
              version: STATE_VERSION,
              date,
              grooves:
                kind === 'grooves'
                  ? s.library.user.map(exportGroove)
                  : [exportGroove({ id: s.editor.grooveId ?? 'u:editor', name: s.editor.name, style: s.editor.style, bpm: s.bpm, meter: s.editor.meter, pattern: s.editor.pattern })],
            };
      area.value = JSON.stringify(data, null, 1);
    };
    const kinds = h('div');
    const renderKinds = () =>
      kinds.replaceChildren(
        segmented(
          [
            { value: 'all', label: 'Todo' },
            { value: 'grooves', label: 'Mis grooves' },
            { value: 'editor', label: 'Groove del beat maker' },
          ],
          kind,
          (v) => {
            kind = v as typeof kind;
            renderKinds();
            build();
          },
          'wrap small',
        ),
      );
    renderKinds();
    build();
    modal('Exportar', [kinds, area, h('p', { class: 'hint' }, 'Guarda el archivo o copia el texto para llevarlo a otro navegador o dispositivo.')], [
      { label: 'Copiar', onClick: () => { copyText(area.value, area); return false; } },
      { label: 'Descargar .json', primary: true, onClick: () => { download(`baketa-${kind}.json`, area.value); return false; } },
      { label: 'Cerrar' },
    ]);
  }

  function importText(text: string): boolean {
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      toast('El texto no es un JSON válido');
      return false;
    }
    const obj = (data ?? {}) as Record<string, unknown>;
    if (obj.type === 'backup' && obj.state) {
      confirmDialog('Restaurar copia', 'Se sustituirán todos tus ajustes y grooves por los del archivo.', 'Restaurar', () => {
        app.stop();
        app.store.replace(hydrate(obj.state));
        toast('Copia restaurada');
      });
      return true;
    }
    const raw = Array.isArray(obj.grooves) ? obj.grooves : Array.isArray(data) ? data : obj.pattern ? [obj] : [];
    const grooves = raw.map(sanitizeGroove).filter((g): g is Groove => g !== null);
    if (!grooves.length) {
      toast('No se ha encontrado ningún groove válido');
      return false;
    }
    app.importGrooves(grooves);
    toast(`${grooves.length} groove(s) importado(s) en Mis grooves`);
    return true;
  }

  function openImport() {
    const area = h('textarea', { class: 'json', rows: 10, spellcheck: 'false', placeholder: 'Pega aquí el JSON exportado…', 'aria-label': 'Datos a importar' });
    const file = h('input', { type: 'file', accept: '.json,application/json', class: 'file-input', 'aria-label': 'Archivo JSON' });
    file.addEventListener('change', async () => {
      const f = file.files?.[0];
      if (f) area.value = await f.text();
    });
    modal('Importar', [field('Archivo', file), area], [
      { label: 'Cancelar' },
      { label: 'Importar', primary: true, onClick: () => importText(area.value) },
    ]);
  }

  function render() {
    const s = st();
    const set = (fn: (x: typeof s.settings) => void) => app.store.update('settings', (x) => fn(x.settings));

    const volume = (key: 'master' | 'metronome' | 'beat', label: string, max: number) => {
      const out = h('output', null, `${Math.round(s.volumes[key] * 100)} %`);
      const el = range(s.volumes[key], 0, max, 0.01, (v) => {
        out.textContent = `${Math.round(v * 100)} %`;
        const cur = { ...s.volumes, [key]: v };
        app.audio.setVolumes(cur.master, cur.metronome, cur.beat);
      }, { 'aria-label': label });
      el.addEventListener('change', () => app.store.update('volumes', (x) => (x.volumes[key] = Number(el.value))));
      return h('div', { class: 'vol-row' }, h('span', null, label), el, out);
    };

    const offsetOut = h('output', null, `${s.settings.visualOffsetMs} ms`);
    const offset = range(s.settings.visualOffsetMs, -150, 150, 5, (v) => (offsetOut.textContent = `${v} ms`), { 'aria-label': 'Ajuste visual' });
    offset.addEventListener('change', () => set((x) => (x.visualOffsetMs = Number(offset.value))));

    const keys = (Object.keys(ACTION_LABELS) as Action[]).map((a) =>
      h(
        'div',
        { class: 'key-row' },
        h('span', null, ACTION_LABELS[a]),
        h('button', {
          type: 'button',
          class: `btn small kbd${capturing === a ? ' capturing' : ''}`,
          onclick: () => {
            capturing = capturing === a ? null : a;
            render();
          },
        }, capturing === a ? 'Pulsa una tecla…' : keyLabel(s.settings.keys[a])),
      ),
    );

    root.replaceChildren(
      h(
        'div',
        { class: 'panel' },
        h('h3', null, 'Volumen'),
        volume('master', 'General', 1),
        volume('metronome', 'Click', 1.5),
        volume('beat', 'Beat', 1.5),
      ),
      h(
        'div',
        { class: 'panel' },
        h('h3', null, 'Pantalla'),
        field('Tema', segmented([{ value: 'dark', label: 'Oscuro' }, { value: 'light', label: 'Claro' }], s.settings.theme, (v) => set((x) => (x.theme = v as 'dark' | 'light'))), 'inline'),
        toggle('Destello en el primer tiempo', s.settings.flash, (v) => set((x) => (x.flash = v)), 'Útil cuando la batería tapa el click'),
        toggle('Mantener la pantalla encendida', s.settings.wakeLock, (v) => set((x) => (x.wakeLock = v)), 'Mientras suena, si el navegador lo permite'),
        h('div', { class: 'vol-row' }, h('span', null, 'Ajuste visual'), offset, offsetOut),
        h('p', { class: 'hint' }, 'Si las luces van adelantadas o atrasadas respecto al sonido (por ejemplo, con auriculares Bluetooth), corrígelo aquí. Solo afecta a la parte visual.'),
      ),
      h(
        'div',
        { class: 'panel' },
        h('h3', null, 'Atajos de teclado'),
        keys,
        h('button', { type: 'button', class: 'btn small ghost', onclick: () => set((x) => (x.keys = { ...DEFAULT_KEYS })) }, 'Restaurar atajos'),
      ),
      h(
        'div',
        { class: 'panel' },
        h('h3', null, 'Datos'),
        h('p', { class: 'hint' }, 'Todo se guarda solo en este navegador. No hay cuentas ni servidores.'),
        h(
          'div',
          { class: 'row wrap' },
          h('button', { type: 'button', class: 'btn', onclick: openExport }, 'Exportar'),
          h('button', { type: 'button', class: 'btn', onclick: openImport }, 'Importar'),
          h('button', {
            type: 'button', class: 'btn danger',
            onclick: () => confirmDialog('Restablecer', 'Se borrarán tus grooves, favoritos y ajustes.', 'Borrar todo', () => {
              app.stop();
              app.store.replace(defaultState());
              toast('Datos restablecidos');
            }),
          }, 'Restablecer todo'),
        ),
      ),
      h(
        'div',
        { class: 'panel about' },
        h('h3', null, 'Acerca de Baketa'),
        h('p', null, 'Metrónomo y caja de ritmos para practicar batería. Gratis, sin anuncios y de código abierto (licencia MIT).'),
        h('p', { class: 'hint' }, 'Todos los sonidos se sintetizan en el propio dispositivo: no se usan samples de terceros. Los grooves incluidos son patrones originales.'),
        h('p', { class: 'hint' }, 'Tipografías Barlow y Barlow Condensed (SIL Open Font License 1.1). La versión Android usa además Capacitor (MIT) y bibliotecas AndroidX (Apache 2.0); los textos de licencia se incluyen en la carpeta licenses/.'),
        h('p', { class: 'hint' }, 'Baketa no recoge datos, no tiene cuentas ni anuncios y funciona sin conexión: todo se guarda solo en este dispositivo.'),
      ),
    );
  }

  document.addEventListener(
    'keydown',
    (e) => {
      if (!capturing) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.key !== 'Escape' && !['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) {
        const action = capturing;
        const key = normalizeKey(e.key);
        app.store.update('settings', (x) => {
          // Una tecla solo puede tener una acción
          for (const a of Object.keys(x.settings.keys) as Action[]) if (x.settings.keys[a] === key) x.settings.keys[a] = '';
          x.settings.keys[action] = key;
        });
      }
      capturing = null;
      render();
    },
    true,
  );

  render();
  app.store.subscribe((keys) => {
    if (keys.has('settings') || keys.has('volumes') || keys.has('all')) render();
  });
  return { el: root };
}
