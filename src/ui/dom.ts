import { GROUP_LABELS, SOUNDS, type SoundGroup } from '../audio/sounds';

export type Child = Node | string | number | null | undefined | false | Child[];
export type Props = Record<string, unknown>;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props?: Props | null,
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v === undefined || v === null || v === false) continue;
      if (k.startsWith('on') && typeof v === 'function') {
        el.addEventListener(k.slice(2), v as EventListener);
      } else if (k === 'class') {
        el.className = String(v);
      } else if (k === 'value' || k === 'checked') {
        (el as unknown as Record<string, unknown>)[k] = v;
      } else {
        el.setAttribute(k, v === true ? '' : String(v));
      }
    }
  }
  append(el, children);
  return el;
}

function append(el: Node, children: Child[]): void {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else el.appendChild(typeof c === 'object' ? c : document.createTextNode(String(c)));
  }
}

const SVG_NS = 'http://www.w3.org/2000/svg';

export function icon(paths: string, size = 22): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'icon');
  svg.innerHTML = paths;
  return svg;
}

const stroke = (d: string) =>
  `<path d="${d}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;

export const ICONS = {
  play: '<path d="M7 4.5v15l13-7.5z" fill="currentColor"/>',
  pause: '<rect x="6" y="4.5" width="4" height="15" rx="1" fill="currentColor"/><rect x="14" y="4.5" width="4" height="15" rx="1" fill="currentColor"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="1.5" fill="currentColor"/>',
  metronome: stroke('M9 3h6l4 18H5z') + stroke('M8 16h8') + stroke('M12 16l5-10'),
  grid: stroke('M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z'),
  library: stroke('M5 4v16M10 4v16M15 5l4 15') ,
  practice: stroke('M3 20h4V14H3zM10 20h4V9h-4zM17 20h4V4h-4z'),
  clock: '<circle cx="12" cy="13" r="8" fill="none" stroke="currentColor" stroke-width="2"/>' + stroke('M12 9v4l2.5 2.5M9 2h6'),
  settings: stroke('M4 7h10M18 7h2M4 17h4M12 17h8') + '<circle cx="16" cy="7" r="2" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="10" cy="17" r="2" fill="none" stroke="currentColor" stroke-width="2"/>',
  speaker: stroke('M4 10v4h4l5 4V6L8 10z') + stroke('M16.5 9a4 4 0 0 1 0 6'),
  mute: stroke('M4 10v4h4l5 4V6L8 10z') + stroke('M17 10l4 4M21 10l-4 4'),
  star: stroke('M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9-5.2-2.8-5.2 2.8 1-5.9-4.3-4.1 5.9-.8z'),
  starFill: '<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9-5.2-2.8-5.2 2.8 1-5.9-4.3-4.1 5.9-.8z" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
  edit: stroke('M4 20h4L19 9l-4-4L4 16z'),
  more: '<circle cx="5" cy="12" r="1.8" fill="currentColor"/><circle cx="12" cy="12" r="1.8" fill="currentColor"/><circle cx="19" cy="12" r="1.8" fill="currentColor"/>',
  undo: stroke('M9 14L4 9l5-5') + stroke('M4 9h10a6 6 0 0 1 0 12h-3'),
  plus: stroke('M12 5v14M5 12h14'),
  close: stroke('M6 6l12 12M18 6L6 18'),
};

/* ---------- componentes ---------- */

/** Botón que repite la acción al mantenerlo pulsado. */
export function repeatButton(label: Child, onStep: () => void, props: Props = {}): HTMLButtonElement {
  let delay: ReturnType<typeof setTimeout> | undefined;
  let repeat: ReturnType<typeof setInterval> | undefined;
  let lastPointer = 0;
  const clear = () => {
    clearTimeout(delay);
    clearInterval(repeat);
  };
  const btn = h(
    'button',
    {
      type: 'button',
      ...props,
      onpointerdown: (e: PointerEvent) => {
        if (e.button !== 0) return;
        e.preventDefault();
        lastPointer = performance.now();
        onStep();
        clear();
        delay = setTimeout(() => (repeat = setInterval(onStep, 70)), 420);
      },
      onpointerup: clear,
      onpointerleave: clear,
      onpointercancel: clear,
      onclick: (e: MouseEvent) => {
        // Teclado (Intro/Espacio). En táctil algunos navegadores también envían click con
        // detail 0 tras el toque: ya se contó en pointerdown, así que se ignora.
        if (e.detail === 0 && performance.now() - lastPointer > 800) onStep();
      },
      oncontextmenu: (e: Event) => e.preventDefault(),
    },
    label,
  );
  return btn;
}

export interface Option<T> {
  value: T;
  label: Child;
  title?: string;
}

export function segmented<T extends string | number>(
  options: Option<T>[],
  current: T | null,
  onChange: (v: T) => void,
  cls = '',
  ariaLabel = '',
): HTMLDivElement {
  return h(
    'div',
    { class: `seg ${cls}`, role: 'radiogroup', 'aria-label': ariaLabel || null },
    options.map((o) =>
      h(
        'button',
        {
          type: 'button',
          role: 'radio',
          class: o.value === current ? 'on' : '',
          'aria-checked': String(o.value === current),
          title: o.title,
          onclick: () => onChange(o.value),
        },
        o.label,
      ),
    ),
  );
}

export function select<T extends string>(
  options: (Option<T> | { group: string; options: Option<T>[] })[],
  current: T,
  onChange: (v: T) => void,
  props: Props = {},
): HTMLSelectElement {
  const el = h('select', { ...props, onchange: () => onChange(el.value as T) });
  const opt = (o: Option<T>) => h('option', { value: o.value }, typeof o.label === 'string' ? o.label : String(o.value));
  for (const o of options) {
    if ('group' in o) el.append(h('optgroup', { label: o.group }, o.options.map(opt)));
    else el.append(opt(o));
  }
  el.value = current;
  return el;
}

export function soundSelect(current: string, onChange: (v: string) => void, opts: { auto?: string; instrumentsOnly?: boolean; label?: string } = {}): HTMLSelectElement {
  const groups = (['click', 'kit', 'perc'] as SoundGroup[]).map((g) => ({
    group: GROUP_LABELS[g],
    options: SOUNDS.filter((s) => s.group === g && (!opts.instrumentsOnly || s.instrument)).map((s) => ({
      value: s.id,
      label: s.label,
    })),
  }));
  const all = opts.auto !== undefined ? [{ value: '', label: opts.auto }, ...groups] : groups;
  return select<string>(all, current, onChange, { 'aria-label': opts.label ?? 'Sonido' });
}

export function numberField(
  value: number,
  min: number,
  max: number,
  onCommit: (v: number) => void,
  props: Props = {},
): HTMLInputElement {
  const el = h('input', {
    type: 'number',
    inputmode: 'numeric',
    min,
    max,
    value: String(value),
    ...props,
  });
  // Último valor válido mostrado: el campo puede actualizarse desde fuera (p. ej. el BPM),
  // así que no se compara con el valor con el que se creó.
  let last = value;
  const commit = () => {
    const raw = el.value.trim();
    const v = Math.round(Number(raw));
    const clamped = raw !== '' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : last;
    el.value = String(clamped);
    last = clamped;
    onCommit(clamped);
  };
  el.addEventListener('change', commit);
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') el.blur();
  });
  el.addEventListener('focus', () => {
    const v = Number(el.value);
    if (el.value !== '' && Number.isFinite(v)) last = v;
    el.select();
  });
  return el;
}

export function stepper(value: number, min: number, max: number, onChange: (v: number) => void, label: string): HTMLDivElement {
  return h(
    'div',
    { class: 'stepper', role: 'group', 'aria-label': label },
    h('button', { type: 'button', class: 'btn icon-btn', 'aria-label': `Menos ${label}`, disabled: value <= min, onclick: () => onChange(value - 1) }, '−'),
    numberField(value, min, max, onChange, { 'aria-label': label }),
    h('button', { type: 'button', class: 'btn icon-btn', 'aria-label': `Más ${label}`, disabled: value >= max, onclick: () => onChange(value + 1) }, '+'),
  );
}

export function toggle(label: Child, checked: boolean, onChange: (v: boolean) => void, hint?: string): HTMLLabelElement {
  const input = h('input', { type: 'checkbox', role: 'switch', checked, onchange: () => onChange(input.checked) });
  return h('label', { class: 'switch' }, input, h('span', { class: 'switch-track', 'aria-hidden': 'true' }), h('span', { class: 'switch-text' }, label, hint ? h('small', null, hint) : null));
}

export function range(value: number, min: number, max: number, step: number, onInput: (v: number) => void, props: Props = {}): HTMLInputElement {
  const el = h('input', { type: 'range', min, max, step, value: String(value), ...props });
  el.addEventListener('input', () => onInput(Number(el.value)));
  return el;
}

export function field(label: Child, control: Child, cls = ''): HTMLDivElement {
  return h('div', { class: `field ${cls}` }, h('span', { class: 'field-label' }, label), control);
}

/* ---------- ventanas y avisos ---------- */

export function modal(title: string, body: Child, actions: { label: string; primary?: boolean; danger?: boolean; onClick?: () => boolean | void }[]): () => void {
  const prevFocus = document.activeElement as HTMLElement | null;
  const close = () => {
    overlay.remove();
    document.removeEventListener('keydown', onKey, true);
    prevFocus?.focus?.();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
    }
  };
  const dialog = h(
    'div',
    { class: 'dialog', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    h('div', { class: 'dialog-head' }, h('h2', null, title), h('button', { type: 'button', class: 'btn icon-btn ghost', 'aria-label': 'Cerrar', onclick: close }, icon(ICONS.close, 18))),
    h('div', { class: 'dialog-body' }, body),
    h(
      'div',
      { class: 'dialog-actions' },
      actions.map((a) =>
        h(
          'button',
          {
            type: 'button',
            class: `btn ${a.primary ? 'primary' : ''} ${a.danger ? 'danger' : ''}`,
            onclick: () => {
              if (a.onClick?.() !== false) close();
            },
          },
          a.label,
        ),
      ),
    ),
  );
  const overlay = h('div', { class: 'overlay', onpointerdown: (e: PointerEvent) => e.target === overlay && close() }, dialog);
  document.body.append(overlay);
  document.addEventListener('keydown', onKey, true);
  const first = dialog.querySelector<HTMLElement>('input, select, textarea, .dialog-actions .primary');
  (first ?? dialog.querySelector<HTMLElement>('button'))?.focus();
  return close;
}

export function prompt(title: string, value: string, onOk: (v: string) => void, okLabel = 'Guardar'): void {
  const input = h('input', { type: 'text', value, maxlength: 80, class: 'text-input' });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      onOk(input.value);
      close();
    }
  });
  const close = modal(title, input, [
    { label: 'Cancelar' },
    { label: okLabel, primary: true, onClick: () => onOk(input.value) },
  ]);
}

export function confirmDialog(title: string, text: string, okLabel: string, onOk: () => void): void {
  modal(title, h('p', null, text), [{ label: 'Cancelar' }, { label: okLabel, primary: true, danger: true, onClick: onOk }]);
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;

export function toast(text: string, action?: { label: string; onClick: () => void }): void {
  document.querySelector('.toast')?.remove();
  clearTimeout(toastTimer);
  const el = h(
    'div',
    { class: 'toast', role: 'status' },
    h('span', null, text),
    action
      ? h('button', { type: 'button', class: 'btn ghost small', onclick: () => { action.onClick(); el.remove(); } }, action.label)
      : null,
  );
  document.body.append(el);
  toastTimer = setTimeout(() => el.remove(), action ? 6000 : 2600);
}

export function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable) return true;
  if (tag === 'INPUT') {
    const type = (el as HTMLInputElement).type;
    return !['checkbox', 'radio', 'range', 'button'].includes(type);
  }
  return false;
}
