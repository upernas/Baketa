import { SOUNDS, SOUND_MAP, renderSound } from './sounds';

type Bus = 'met' | 'beat';

interface Scheduled {
  src: AudioBufferSourceNode;
  time: number;
}

type AudioSessionNavigator = Navigator & { audioSession?: { type: string } };

/**
 * Grafo:  voz → ganancia de nota → [canal de instrumento] → bus (met / beat) → master → limitador → salida
 */
export class AudioEngine {
  ctx: AudioContext | null = null;
  private buffers = new Map<string, AudioBuffer>();
  private master!: GainNode;
  private buses!: Record<Bus, GainNode>;
  private channels = new Map<string, GainNode>();
  private scheduled = new Set<Scheduled>();
  private openHat: { gain: GainNode; time: number } | null = null;
  private initPromise: Promise<void> | null = null;
  private pendingLevels = { master: 0.9, met: 0.9, beat: 0.9 };
  private pendingChannels = new Map<string, number>();

  get ready(): boolean {
    return this.ctx !== null && this.buffers.size > 0;
  }

  now(): number {
    return this.ctx?.currentTime ?? 0;
  }

  /** Latencia de salida estimada, para alinear la parte visual con lo que se oye. */
  outputLatency(): number {
    const c = this.ctx;
    if (!c) return 0;
    return (c.outputLatency || 0) + (c.baseLatency || 0);
  }

  /** Debe llamarse desde un gesto del usuario (requisito de los navegadores móviles). */
  init(): Promise<void> {
    if (this.initPromise) {
      void this.ctx?.resume();
      return this.initPromise;
    }
    this.initPromise = (async () => {
      const nav = navigator as AudioSessionNavigator;
      // iOS: reproducir aunque el interruptor de silencio esté activado
      if (nav.audioSession) nav.audioSession.type = 'playback';

      const ctx = new AudioContext({ latencyHint: 'interactive' });
      this.ctx = ctx;
      void ctx.resume();

      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -4;
      limiter.knee.value = 2;
      limiter.ratio.value = 16;
      limiter.attack.value = 0.002;
      limiter.release.value = 0.12;
      limiter.connect(ctx.destination);

      this.master = ctx.createGain();
      this.master.connect(limiter);
      this.buses = { met: ctx.createGain(), beat: ctx.createGain() };
      this.buses.met.connect(this.master);
      this.buses.beat.connect(this.master);
      this.setVolumes(this.pendingLevels.master, this.pendingLevels.met, this.pendingLevels.beat);

      // Buffer silencioso: desbloquea el audio en Safari
      const silent = ctx.createBufferSource();
      silent.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
      silent.connect(ctx.destination);
      silent.start();

      const rendered = await Promise.all(SOUNDS.map((s) => renderSound(s, ctx.sampleRate)));
      SOUNDS.forEach((s, i) => this.buffers.set(s.id, rendered[i]));
    })();
    return this.initPromise;
  }

  async resume(): Promise<void> {
    if (this.ctx && this.ctx.state !== 'running') await this.ctx.resume();
  }

  /** Permite sustituir un sonido por un sample propio (p. ej. un .wav libre de derechos). */
  async loadSample(id: string, url: string): Promise<void> {
    await this.init();
    const data = await (await fetch(url)).arrayBuffer();
    this.buffers.set(id, await this.ctx!.decodeAudioData(data));
  }

  setVolumes(master: number, met: number, beat: number): void {
    this.pendingLevels = { master, met, beat };
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(master, t, 0.015);
    this.buses.met.gain.setTargetAtTime(met, t, 0.015);
    this.buses.beat.gain.setTargetAtTime(beat, t, 0.015);
  }

  setChannel(id: string, vol: number, mute: boolean): void {
    const v = mute ? 0 : vol;
    this.pendingChannels.set(id, v);
    if (!this.ctx) return;
    this.channel(id).gain.setTargetAtTime(v, this.ctx.currentTime, 0.01);
  }

  private channel(id: string): GainNode {
    let g = this.channels.get(id);
    if (!g && this.ctx) {
      g = this.ctx.createGain();
      g.gain.value = this.pendingChannels.get(id) ?? 1;
      g.connect(this.buses.beat);
      this.channels.set(id, g);
    }
    return g!;
  }

  play(sound: string, time: number, gain: number, bus: Bus): void {
    const ctx = this.ctx;
    const buf = this.buffers.get(sound);
    if (!ctx || !buf || gain <= 0) return;

    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(g);
    g.connect(bus === 'beat' && SOUND_MAP.get(sound)?.instrument ? this.channel(sound) : this.buses[bus]);

    // El hi-hat cerrado o de pedal corta el abierto, como en una batería real
    if ((sound === 'hhc' || sound === 'hhp') && this.openHat && this.openHat.time < time) {
      this.openHat.gain.gain.setTargetAtTime(0, time, 0.012);
      this.openHat = null;
    }
    if (sound === 'hho') this.openHat = { gain: g, time };

    const rec: Scheduled = { src, time };
    this.scheduled.add(rec);
    src.onended = () => {
      this.scheduled.delete(rec);
      src.disconnect();
      g.disconnect();
    };
    src.start(Math.max(time, ctx.currentTime));
  }

  preview(sound: string, gain = 0.85): void {
    void this.init().then(() => {
      void this.resume();
      if (this.ctx) this.play(sound, this.ctx.currentTime + 0.01, gain, 'met');
    });
  }

  /** Cancela las notas ya programadas que aún no han sonado. */
  cancelScheduled(): void {
    const now = this.now();
    for (const rec of this.scheduled) {
      if (rec.time > now + 0.002) {
        try {
          rec.src.stop();
        } catch {
          /* ya detenido */
        }
      }
    }
    this.openHat = null;
  }
}
