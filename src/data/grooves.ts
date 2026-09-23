import { parseMeter } from '../core/meter';
import { parseTrack } from '../core/patterns';
import type { Groove, InstrumentId, Level } from '../core/types';

/**
 * Notación: X = acento, x = normal, g = ghost/suave, . = silencio.
 * Espacios y | solo sirven para leer mejor (pulsos y compases).
 *
 * Los patrones son transcripciones propias. Los ritmos tradicionales (claves,
 * campana 12/8, tresillo…) son de dominio público; los grooves "clásicos"
 * están escritos a partir de descripciones didácticas publicadas y llevan el
 * nombre del estilo, no reproducen ninguna grabación.
 */
interface GrooveDef {
  id: string;
  name: string;
  bpm: number;
  meter?: string;
  spb: number;
  bars?: number;
  swing?: number;
  unit?: 2 | 4;
  level?: 1 | 2 | 3;
  notes?: string;
  t: Record<InstrumentId, string>;
}

export const STYLES = [
  'Rock', 'Funk', 'Clásicos', 'Blues', 'Jazz', 'Reggae', 'Brasil', 'Latin', 'Salsa',
  'Metal', 'Electrónica y urbano', 'Irregulares', 'Otros',
];

export const LEVEL_NAMES = ['', 'Básico', 'Intermedio', 'Avanzado'];

const DEFS: Record<string, GrooveDef[]> = {
  Rock: [
    { id: 'rock-basic', name: 'Rock básico', bpm: 100, spb: 2,
      t: { hhc: 'xx xx xx xx', snare: '.. x. .. x.', kick: 'x. .. x. ..' } },
    { id: 'rock-8', name: 'Rock en corcheas', bpm: 110, spb: 2,
      t: { hhc: 'Xx Xx Xx Xx', snare: '.. x. .. x.', kick: 'x. .x x. ..' } },
    { id: 'rock-16', name: 'Rock en semicorcheas', bpm: 88, spb: 4, level: 2,
      notes: 'Hi-hat con una mano: acentúa las corcheas.',
      t: { hhc: 'Xxxx Xxxx Xxxx Xxxx', snare: '.... x... .... x...', kick: 'x... ..x. x.x. ....' } },
    { id: 'rock-16kick', name: 'Rock con bombo en semicorcheas', bpm: 96, spb: 4, level: 2,
      t: { hhc: 'x.x. x.x. x.x. x.x.', snare: '.... x... .... x...', kick: 'x... ...x x.x. ...x' } },
    { id: 'rock-half', name: 'Half-time rock', bpm: 140, spb: 4,
      t: { hhc: 'x.x. x.x. x.x. x.x.', snare: '.... .... x... ....', kick: 'x... ...x ..x. ....' } },
    { id: 'rock-shuffle', name: 'Shuffle rock', bpm: 120, spb: 3,
      t: { hhc: 'x.x x.x x.x x.x', snare: '... x.. ... x..', kick: 'x.. ..x x.. ...' } },
    { id: 'rock-90s', name: 'Rock de los 90 con hi-hat abierto', bpm: 116, spb: 4, level: 2,
      t: {
        crash: 'x... .... .... ....', hho: '..x. x.x. x.x. x.x.',
        snare: '.... x... .... x.xx', kick: 'x.x. ..x. x.x. ....',
      } },
    { id: 'punk', name: 'Punk (skank beat)', bpm: 170, spb: 2,
      t: { kick: 'x. x. x. x.', snare: '.x .x .x .x', hhc: 'xx xx xx xx' } },
    { id: 'rock-fill', name: 'Rock con fill', bpm: 100, spb: 4, bars: 2, level: 2,
      notes: 'Un compás de groove y otro con fill: repítelo sin perder el 1.',
      t: {
        crash: 'x... .... .... ....|.... .... .... ....',
        hhc: '..x. x.x. x.x. x.x.|x.x. x.x. .... ....',
        snare: '.... x... .... x...|.... x... xxxx ....',
        tomH: '.... .... .... ....|.... .... .... xx..',
        tomF: '.... .... .... ....|.... .... .... ..xx',
        kick: 'x... ..x. x... ....|x... ..x. .... ....',
      } },
  ],
  Funk: [
    { id: 'funk-basic', name: 'Funk básico', bpm: 96, spb: 4,
      t: { hhc: 'x.x. x.x. x.x. x.x.', snare: '.... x... .... x...', kick: 'x.x. .... ..x. ...x' } },
    { id: 'funk-displaced', name: 'Funk con caja desplazada', bpm: 96, spb: 4, level: 2,
      notes: 'Caja en la "a" del 2 y bombo en la "e" del 3.',
      t: { hhc: 'x.x. x.x. x.x. x.x.', snare: '.... x..x .... x...', kick: 'x... .... .x.. ....' } },
    { id: 'funk-ghost', name: 'Funk con ghost notes', bpm: 92, spb: 4, level: 2,
      notes: 'Las ghost notes casi no se oyen: la caja apenas despega del parche.',
      t: { hhc: 'x.x. x.x. x.x. x.x.', snare: '...g X..g .g.. X..g', kick: 'x.x. .... ..xx ....' } },
    { id: 'funk-16', name: 'Funk en semicorcheas', bpm: 100, spb: 4, level: 2,
      t: {
        hhc: 'XxXx XxXx XxXx Xx.x', hho: '.... .... .... ..x.',
        snare: '.... x... .... x...', kick: 'x..x ..x. ..x. ....',
      } },
    { id: 'funk-sync', name: 'Funk sincopado', bpm: 98, spb: 4, level: 2,
      t: {
        hhc: 'x.x. x.x. x.x. x...', hho: '.... .... .... ..x.',
        snare: '.... x..g .g.. x..x', kick: 'x... ..x. .x.x ....',
      } },
    { id: 'funk-linear', name: 'Groove lineal', bpm: 96, spb: 4, level: 3,
      notes: 'Nunca suenan dos instrumentos a la vez.',
      t: { kick: 'x... ..x. .x.. ...x', hhc: '.xx. .x.x x.x. .xx.', snare: '...g X... ...g X...' } },
    { id: 'funk-paradiddle', name: 'Groove de paradiddle', bpm: 92, spb: 4, level: 3,
      notes: 'Paradiddle (D I D D  I D I I): derecha en el hi-hat, izquierda en la caja.',
      t: { hhc: 'X.xx .x.. X.xx .x..', snare: '.g.. X.gg .g.. X.gg', kick: 'x... .... x.x. ....' } },
  ],
  Clásicos: [
    { id: 'funky-drummer', name: 'Break funk de 1970 (estilo Funky Drummer)', bpm: 100, spb: 4, level: 3,
      notes: 'Hi-hat en semicorcheas con una mano, aperturas antes del 3 y después del 4, y ghost notes alrededor del backbeat.',
      t: {
        hhc: 'Xxxx Xxx. Xxxx X.xx', hho: '.... ...x .... .x..',
        snare: '.... X..g .g.g X..g', kick: 'x.x. .... ..x. .x..',
      } },
    { id: 'amen', name: 'Break de 1969 (estilo Amen)', bpm: 136, spb: 4, bars: 2, level: 3,
      notes: 'La base del jungle y el drum & bass. Pruébalo también a 170 BPM.',
      t: {
        ride: 'x.x. x.x. x.x. x.x.|x.x. x.x. x.x. x.x.',
        snare: '.... x..x .x.. x..x|.... x..x .x.. ..x.',
        kick: 'x.x. .... ..xx ....|x.x. .... ..x. ....',
      } },
    { id: 'purdie', name: 'Half-time shuffle (estilo Purdie)', bpm: 88, spb: 3, level: 3,
      notes: 'Ghost notes en la nota central de cada tresillo; el golpe fuerte de caja, en el 3.',
      t: { hhc: 'X.x X.x X.x X.x', snare: '.g. .g. X.. .g.', kick: 'x.. ..x ... ..x' } },
    { id: 'bonham-shuffle', name: 'Half-time shuffle con hi-hat abierto', bpm: 88, spb: 3, bars: 2, level: 3,
      notes: 'Como el anterior, con una apertura en el último tresillo del 1 (al estilo de Bonham).',
      t: {
        hhc: 'X.. X.x X.x X.x|X.x X.x X.x X.x',
        hho: '..x ... ... ...|... ... ... ...',
        snare: '.g. .g. X.. .g.|.g. .g. X.. .g.',
        kick: 'x.. ..x ... ..x|x.. ..x ..x ...',
      } },
    { id: 'motown', name: 'Motown (caja en los cuatro tiempos)', bpm: 120, spb: 2,
      t: { snare: 'x. X. x. X.', shaker: 'xx xx xx xx', kick: 'x. .x x. .x' } },
    { id: 'train', name: 'Train beat', bpm: 130, spb: 4, level: 2,
      notes: 'Semicorcheas continuas en la caja con acentos en 2 y 4 (country).',
      t: { snare: 'gggg Xggg gggg Xggg', kick: 'x... .... x... ....', hhp: '.... x... .... x...' } },
    { id: 'second-line', name: 'Estilo second line', bpm: 100, spb: 4, bars: 2, swing: 0.6, level: 3,
      notes: 'Caja de desfile de Nueva Orleans adaptada a la batería.',
      t: {
        kick: 'x... ..x. x... ....|x... ..x. ..x. x...',
        snare: '..gX .g.g ..gX .g.X|..gX .g.g .gXg ..X.',
        hhp: '.... x... .... x...|.... x... .... x...',
      } },
    { id: 'hambone', name: 'Ritmo hambone', bpm: 110, spb: 2, bars: 2,
      notes: 'La figura de la clave 3-2 llevada a los toms, muy usada en el rock and roll.',
      t: {
        tomF: 'x. .x .. x.|.. x. x. ..',
        shaker: 'xx xx xx xx|xx xx xx xx',
        kick: 'x. .. x. ..|x. .. x. ..',
      } },
  ],
  Blues: [
    { id: 'blues-shuffle', name: 'Blues shuffle', bpm: 110, spb: 3,
      t: { hhc: 'x.x x.x x.x x.x', snare: '... x.. ... x..', kick: 'x.. ... x.. ...' } },
    { id: 'blues-slow', name: 'Slow blues', bpm: 50, meter: '12/8', spb: 3,
      notes: 'El BPM se refiere a la negra con puntillo.',
      t: { hhc: 'xxx xxx xxx xxx', snare: '... X.g ... X..', kick: 'x.. ..x x.. ...' } },
    { id: 'blues-texas', name: 'Texas shuffle', bpm: 130, spb: 3, level: 2,
      t: {
        ride: 'x.x x.x x.x x.x', snare: 'g.g X.g g.g X.g',
        kick: 'x.. x.. x.. x..', hhp: '... x.. ... x..',
      } },
  ],
  Jazz: [
    { id: 'jazz-ride', name: 'Ride de jazz', bpm: 140, spb: 3,
      t: { ride: 'x.. x.x x.. x.x', hhp: '... x.. ... x..' } },
    { id: 'jazz-swing', name: 'Jazz swing', bpm: 160, spb: 3, level: 2,
      notes: 'Bombo "feathering": casi imperceptible, en los cuatro pulsos.',
      t: {
        ride: 'x.. X.x x.. X.x', hhp: '... x.. ... x..',
        kick: 'g.. g.. g.. g..', snare: '..g ... ..g ...',
      } },
    { id: 'jazz-hh', name: 'Swing con hi-hat', bpm: 130, spb: 3,
      t: { hhc: 'x.. X.x x.. X.x', kick: 'g.. g.. g.. g..', snare: '... ... ..g ...' } },
    { id: 'jazz-shuffle', name: 'Jazz shuffle', bpm: 120, spb: 3, level: 2,
      t: {
        ride: 'x.x x.x x.x x.x', snare: 'g.. x.g g.. x.g',
        kick: 'g.. g.. g.. g..', hhp: '... x.. ... x..',
      } },
    { id: 'jazz-waltz', name: 'Vals de jazz', bpm: 150, meter: '3/4', spb: 3, level: 2,
      t: { ride: 'x.. x.x x.x', hhp: '... x.. ...', kick: 'g.. ... ...', snare: '... ... ..g' } },
  ],
  Reggae: [
    { id: 'reggae-onedrop', name: 'One drop', bpm: 75, spb: 3,
      notes: 'Nada en el 1: bombo y aro juntos en el 3.',
      t: { hhc: 'x.x x.x x.x x.x', rim: '... ... x.. ...', kick: '... ... x.. ...' } },
    { id: 'reggae-rockers', name: 'Rockers', bpm: 80, spb: 4,
      t: {
        hhc: 'x... x... x... x...', hho: '..x. ..x. ..x. ..x.',
        rim: '.... .... x... ....', kick: 'x... ..x. x... ....',
      } },
    { id: 'reggae-steppers', name: 'Steppers', bpm: 80, spb: 4, swing: 0.58,
      t: { hhc: 'x.xx x.xx x.xx x.xx', rim: '.... .... x... ....', kick: 'x... x... x... x...' } },
  ],
  Brasil: [
    { id: 'bossa-basic', name: 'Bossa básica', bpm: 130, spb: 2, bars: 2,
      t: {
        rim: 'x. .x .. x.|.. x. .x ..',
        hhc: 'xx xx xx xx|xx xx xx xx',
        kick: 'x. .x x. .x|x. .x x. .x',
      } },
    { id: 'bossa-var', name: 'Bossa con variación', bpm: 130, spb: 2, bars: 2,
      t: {
        rim: 'x. .x .. x.|.x .. x. ..',
        ride: 'xx xx xx xx|xx xx xx xx',
        kick: 'x. .x x. .x|x. .x x. .x',
        hhp: '.. x. .. x.|.. x. .. x.',
      } },
    { id: 'samba', name: 'Samba', bpm: 100, meter: '2/4', spb: 4, bars: 2, level: 2,
      notes: 'El bombo marca más fuerte el segundo pulso.',
      t: {
        kick: 'x..x X..x|x..x X..x',
        shaker: 'XxxX XxxX|XxxX XxxX',
        rim: 'x.x. .x.x|.x.. x.x.',
      } },
    { id: 'baiao', name: 'Baião', bpm: 100, meter: '2/4', spb: 4, level: 2,
      notes: 'Bombo en el 1, la "a" del 1 y el "y" del 2, como la zabumba.',
      t: { kick: 'x..x ..x.', hhc: 'xxXx xxXx', rim: '.... x...' } },
  ],
  Latin: [
    { id: 'clave-32', name: 'Clave 3-2', bpm: 100, spb: 2, bars: 2,
      t: { clave: 'x. .x .. x.|.. x. x. ..', shaker: 'xX xX xX xX|xX xX xX xX' } },
    { id: 'clave-23', name: 'Clave 2-3', bpm: 100, spb: 2, bars: 2,
      t: { clave: '.. x. x. ..|x. .x .. x.', shaker: 'xX xX xX xX|xX xX xX xX' } },
    { id: 'rumba-clave', name: 'Clave de rumba 3-2', bpm: 100, spb: 2, bars: 2,
      notes: 'Como la de son, pero la tercera nota llega una corchea más tarde.',
      t: { clave: 'x. .x .. .x|.. x. x. ..', shaker: 'xX xX xX xX|xX xX xX xX' } },
    { id: 'habanera', name: 'Habanera y tresillo', bpm: 80, meter: '2/4', spb: 4,
      t: { kick: 'x..x x.x.', rim: 'x..x ..x.', shaker: 'x.x. x.x.' } },
    { id: 'chacha', name: 'Cha-cha-chá', bpm: 120, spb: 2,
      t: { cowbell: 'X. x. X. x.', tomF: '.. .. .. xx', kick: 'x. .. .. ..', rim: '.. x. .. ..' } },
    { id: 'cumbia', name: 'Cumbia', bpm: 90, meter: '2/4', spb: 4,
      t: { shaker: 'x.xx x.xx', kick: 'x... x...', rim: '..x. ..x.' } },
    { id: 'songo', name: 'Songo', bpm: 110, spb: 4, level: 3,
      t: {
        cowbell: 'x... x... x... x...', hhp: '.... x... .... x...',
        snare: 'g..X g.g. g.X. g..g', tomF: '.... .... .... ..x.',
        kick: '.... ..x. .... x...',
      } },
    { id: 'mozambique', name: 'Mozambique', bpm: 110, spb: 4, level: 3,
      notes: 'Campana de Mozambique en la mano derecha; toms y caja responden entre medias.',
      t: {
        cowbell: 'x.x. xx.x .xx. xx.x', tomH: '.... ..x. ...x ....',
        tomF: '.... .... .... ..x.', snare: '...x .... .... ....',
        kick: '.... x... .... x...', hhp: 'x... x... x... x...',
      } },
    { id: 'tumbao-conga', name: 'Tumbao (congas)', bpm: 100, spb: 2,
      t: { congaH: 'x. X. x. ..', congaL: '.. .. .. xx', shaker: 'xx xx xx xx' } },
    { id: 'bembe', name: 'Campana 12/8', bpm: 100, meter: '12/8', spb: 3, level: 2,
      notes: 'El patrón de campana de doce tiempos, base de muchos ritmos afrocubanos.',
      t: { cowbell: 'x.x .xx .x. x.x', kick: 'x.. x.. x.. x..', congaL: '... ..x ... ..x' } },
    { id: 'nanigo', name: '6/8 afrocubano en batería', bpm: 100, meter: '12/8', spb: 3, level: 2,
      t: {
        ride: 'x.x .xx .x. x.x', kick: 'x.. ... x.. ...',
        hhp: '... x.. ... x..', snare: '... ..g ... ..x',
      } },
  ],
  Salsa: [
    { id: 'salsa-son', name: 'Son clave con campana', bpm: 180, spb: 2, bars: 2,
      t: {
        clave: '.. x. x. ..|x. .x .. x.',
        cowbell: 'x. x. x. x.|x. x. x. x.',
        kick: '.. .x .. x.|.. .x .. x.',
      } },
    { id: 'salsa-cascara', name: 'Cáscara 3-2', bpm: 180, spb: 2, bars: 2, level: 2,
      t: {
        rim: 'x. xx .x .x|x. x. xx .x',
        clave: 'g. .g .. g.|.. g. g. ..',
        kick: '.. .x .. x.|.. .x .. x.',
      } },
    { id: 'salsa-tumbao', name: 'Tumbao', bpm: 180, spb: 2, bars: 2, level: 2,
      notes: 'El bombo anticipa como lo haría el bajo: en el "y" del 2 y en el 4.',
      t: {
        congaH: 'g. X. g. ..|g. X. g. ..',
        congaL: '.. .. .. xx|.. .. .. xx',
        kick: '.. .x .. x.|.. .x .. x.',
        clave: '.. g. g. ..|g. .g .. g.',
      } },
    { id: 'salsa-kit', name: 'Salsa básica en batería', bpm: 170, spb: 2, bars: 2, level: 2,
      t: {
        cowbell: 'X. x. X. x.|X. x. X. x.',
        clave: '.. x. x. ..|x. .x .. x.',
        kick: '.. .x .. x.|.. .x .. x.',
        tomF: '.. .. .. xx|.. .. .. xx',
        hhp: '.. x. .. x.|.. x. .. x.',
      } },
  ],
  Metal: [
    { id: 'metal', name: 'Metal con doble bombo', bpm: 120, spb: 4, level: 2,
      t: {
        kick: 'xxxx xxxx xxxx xxxx', snare: '.... X... .... X...',
        crash: 'x... .... .... ....', ride: '.... x... x... x...',
      } },
    { id: 'metal-gallop', name: 'Galope con doble bombo', bpm: 150, spb: 4, level: 2,
      t: {
        kick: 'x.xx x.xx x.xx x.xx', snare: '.... x... .... x...',
        crash: 'x... .... .... ....', ride: '.... x... x... x...',
      } },
    { id: 'blast', name: 'Blast beat tradicional', bpm: 180, spb: 2, level: 3,
      notes: 'Bombo y plato juntos, caja en los contratiempos.',
      t: { kick: 'x. x. x. x.', ride: 'x. x. x. x.', snare: '.x .x .x .x' } },
    { id: 'bomb-blast', name: 'Bomb blast', bpm: 150, spb: 4, level: 3,
      notes: 'Manos a la vez en corcheas y semicorcheas continuas en los pies.',
      t: { kick: 'xxxx xxxx xxxx xxxx', snare: 'x.x. x.x. x.x. x.x.', crash: 'x.x. x.x. x.x. x.x.' } },
  ],
  'Electrónica y urbano': [
    { id: 'disco', name: 'Disco', bpm: 120, spb: 4,
      t: {
        kick: 'x... x... x... x...', snare: '.... x... .... x...',
        hhc: 'x... x... x... x...', hho: '..x. ..x. ..x. ..x.',
      } },
    { id: 'house', name: 'House', bpm: 124, spb: 4,
      t: {
        kick: 'x... x... x... x...', clap: '.... x... .... x...',
        hhc: 'xg.g xg.g xg.g xg.g', hho: '..x. ..x. ..x. ..x.',
      } },
    { id: 'garage', name: '2-step garage', bpm: 132, spb: 4, swing: 0.6, level: 2,
      t: { kick: 'x... .... ..x. ....', snare: '.... x... .... x...', hhc: 'x.x. x.xx x.x. x.xx' } },
    { id: 'hiphop', name: 'Hip-hop', bpm: 90, spb: 4, swing: 0.6,
      t: { kick: 'x... ...x ..x. ....', snare: '.... x... .... x...', hhc: 'x.x. x.x. x.x. x.x.' } },
    { id: 'trap', name: 'Trap (half-time)', bpm: 140, spb: 8, level: 2,
      notes: 'Resolución de fusas para los redobles del hi-hat.',
      t: {
        hhc: 'x.x.x.x. x.x.x.x. x.x.x.x. x.xxxxx.',
        kick: 'x....... ......x. ..x..... ........',
        snare: '........ ........ X....... ........',
      } },
    { id: 'rnb', name: 'R&B', bpm: 82, spb: 4, swing: 0.58,
      t: { hhc: 'xgxg xgxg xgxg xgxg', rim: '.... x... .... x...', kick: 'x..x ...x ..x. ....' } },
    { id: 'reggaeton', name: 'Reggaetón (dembow)', bpm: 95, spb: 4,
      t: { kick: 'x... x... x... x...', snare: '...x ..x. ...x ..x.', hhc: 'x.x. x.x. x.x. x.x.' } },
    { id: 'dnb', name: 'Drum & bass', bpm: 172, spb: 4, level: 2,
      t: { kick: 'x... .... ..x. ....', snare: '.... x..g .... x...', hhc: 'x.x. x.x. x.x. x.x.' } },
  ],
  Irregulares: [
    { id: 'odd-54', name: 'Swing en 5/4 (3+2)', bpm: 170, meter: '5/4', spb: 3, level: 2,
      t: {
        ride: 'x.. x.x x.. x.x x.x', hhp: '... x.. ... x.. ...',
        kick: 'g.. ... ... x.. ...', snare: '... ... ..x ... ..g',
      } },
    { id: 'odd-78', name: 'Rock en 7/8 (2+2+3)', bpm: 140, meter: '7/8', spb: 2, level: 2,
      notes: 'El BPM se refiere a la corchea.',
      t: {
        hhc: 'x. x. x. x. x. x. x.',
        kick: 'x. .. .. .. x. .. ..',
        snare: '.. .. x. .. .. .. x.',
      } },
    { id: 'odd-74', name: 'Groove en 7/4', bpm: 110, meter: '7/4', spb: 2, level: 2,
      t: {
        hhc: 'xx xx xx xx xx xx xx',
        kick: 'x. .. .x .. x. .. x.',
        snare: '.. x. .. x. .. x. ..',
      } },
    { id: 'odd-98', name: 'Aksak 9/8 (2+2+2+3)', bpm: 90, meter: '9/8', spb: 3, level: 3,
      notes: 'Se muestra en tres pulsos, pero se siente 2+2+2+3: pon esa agrupación en el metrónomo.',
      t: { kick: 'x.. ... x..', snare: '..x .x. ..g', hhc: 'xxx xxx xxx' } },
    { id: 'odd-118', name: 'Kopanitsa 11/8 (2+2+3+2+2)', bpm: 200, meter: '11/8', spb: 2, level: 3,
      notes: 'Ritmo balcánico. El BPM se refiere a la corchea.',
      t: {
        hhc: 'x. x. x. x. x. x. x. x. x. x. x.',
        kick: 'x. .. .. .. .. .. .. x. .. .. ..',
        snare: '.. .. x. .. x. .. .. .. .. x. ..',
      } },
    { id: 'poly-34', name: 'Polirritmia 3:4 en el ride', bpm: 90, spb: 3, level: 3,
      notes: 'El ride da tres golpes iguales por compás contra los cuatro pulsos.',
      t: {
        ride: 'x.. .x. ..x ...', kick: 'x.. ... x.. ...',
        snare: '... x.. ... x..', hhp: 'x.. x.. x.. x..',
      } },
    { id: 'poly-43', name: 'Polirritmia 4:3 en 3/4', bpm: 80, meter: '3/4', spb: 4, level: 3,
      notes: 'Cuatro golpes iguales en el ride contra tres pulsos.',
      t: { ride: 'x..x ..x. .x..', kick: 'x... .... ....', hhp: '.... x... x...', snare: '.... .... x...' } },
  ],
  Otros: [
    { id: 'pop', name: 'Pop', bpm: 105, spb: 4,
      t: { kick: 'x... ..x. x.x. ....', snare: '.... x... .... x...', hhc: 'x.x. x.x. x.x. x.x.' } },
    { id: 'afrobeat', name: 'Afrobeat', bpm: 110, spb: 4, level: 2,
      t: {
        hhc: 'x.x. xx.x x.x. xx..', hho: '.... .... .... ..x.',
        snare: '.... x... ..g. x..g', kick: 'x..x .... x... .x..',
        cowbell: 'x.x. .x.x .x.x .x..',
      } },
    { id: 'waltz', name: 'Vals', bpm: 140, meter: '3/4', spb: 2,
      t: { kick: 'x. .. ..', snare: '.. x. x.', hhp: '.. x. x.' } },
    { id: 'ballad-68', name: 'Balada en 6/8', bpm: 56, meter: '6/8', spb: 3,
      t: { hhc: 'xxx xxx', snare: '... x..', kick: 'x.. ..x' } },
  ],
};

function build(style: string, d: GrooveDef): Groove {
  const tracks: Record<InstrumentId, Level[]> = {};
  for (const [inst, src] of Object.entries(d.t)) tracks[inst] = parseTrack(src);
  return {
    id: `b:${d.id}`,
    name: d.name,
    style,
    bpm: d.bpm,
    meter: parseMeter(d.meter ?? '4/4'),
    builtin: true,
    notes: d.notes,
    level: d.level ?? 1,
    pattern: {
      stepsPerBeat: d.spb,
      bars: d.bars ?? 1,
      swing: { amount: d.swing ?? 0.5, unit: d.unit ?? (d.spb >= 4 ? 4 : 2) },
      tracks,
    },
  };
}

export const BUILTIN_GROOVES: Groove[] = Object.entries(DEFS).flatMap(([style, defs]) =>
  defs.map((d) => build(style, d)),
);
