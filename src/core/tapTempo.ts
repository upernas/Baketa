/**
 * Calcula el tempo a partir de pulsaciones.
 * Promedia las últimas pulsaciones y reinicia la serie tras una pausa larga
 * o cuando el intervalo cambia mucho (el usuario ha cambiado de tempo).
 */
export class TapTempo {
  private taps: number[] = [];

  constructor(
    private readonly maxTaps = 8,
    private readonly resetAfterMs = 2000,
    private readonly tolerance = 0.4,
  ) {}

  tap(nowMs: number): number | null {
    const last = this.taps[this.taps.length - 1];
    if (last !== undefined) {
      const interval = nowMs - last;
      if (interval <= 0) return null;
      if (interval > this.resetAfterMs) {
        this.taps = [];
      } else if (this.taps.length >= 2) {
        const avg = (last - this.taps[0]) / (this.taps.length - 1);
        if (Math.abs(interval - avg) / avg > this.tolerance) this.taps = [last];
      }
    }
    this.taps.push(nowMs);
    if (this.taps.length > this.maxTaps) this.taps.shift();
    if (this.taps.length < 2) return null;
    const avg = (this.taps[this.taps.length - 1] - this.taps[0]) / (this.taps.length - 1);
    return 60000 / avg;
  }

  get count(): number {
    return this.taps.length;
  }

  reset(): void {
    this.taps = [];
  }
}
