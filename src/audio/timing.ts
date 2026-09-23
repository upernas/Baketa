export interface SwingInfo {
  amount: number;
  unit: number;
  compound: boolean;
}

const isPow2 = (n: number): boolean => n > 0 && (n & (n - 1)) === 0;

/**
 * Deforma una posición dentro del pulso (0..1) para aplicar swing.
 * El pulso se divide en pares (unit / 2) y dentro de cada par la segunda mitad
 * se desplaza hasta `amount` (0.5 recto, 0.667 ≈ tresillo, 0.75 punteado).
 */
export function swingWarp(frac: number, amount: number, unit: number): number {
  if (amount <= 0.5 || unit < 2) return frac;
  const pairs = unit / 2;
  const pairLen = 1 / pairs;
  const idx = Math.min(pairs - 1, Math.floor(frac / pairLen + 1e-9));
  const local = (frac - idx * pairLen) / pairLen;
  const warped =
    local < 0.5 ? (local / 0.5) * amount : amount + ((local - 0.5) / 0.5) * (1 - amount);
  return (idx + warped) * pairLen;
}

/**
 * Posición (fracción del pulso) del paso `step` cuando el pulso se divide en `stepsPerPulse`.
 * El swing solo afecta a divisiones binarias en compases simples; los tresillos ya tienen su propio vaivén.
 */
export function stepFraction(step: number, stepsPerPulse: number, sw: SwingInfo): number {
  const f = step / stepsPerPulse;
  if (sw.compound || sw.amount <= 0.5 || stepsPerPulse < 2 || !isPow2(stepsPerPulse)) return f;
  return swingWarp(f, sw.amount, sw.unit);
}
