"use client";

/**
 * Soft foil scratch SFX — noise loop at low volume.
 * Starts on pointerdown, fades out on pointerup. Never restarts every frame.
 */
export class ScratchAudio {
  private ctx: AudioContext | null = null;
  private gain: GainNode | null = null;
  private source: AudioBufferSourceNode | null = null;
  private playing = false;
  private fadeTimer: number | null = null;
  private readonly targetVol = 0.15;

  private ensure() {
    if (this.ctx) return this.ctx;
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    this.ctx = new AC();
    return this.ctx;
  }

  private makeNoiseBuffer(ctx: AudioContext): AudioBuffer {
    const len = ctx.sampleRate * 0.35;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      // Soft brownish noise — closer to foil/paper than white noise
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 2.4;
    }
    return buf;
  }

  start() {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    if (this.fadeTimer != null) {
      window.clearTimeout(this.fadeTimer);
      this.fadeTimer = null;
    }

    const ctx = this.ensure();
    if (!ctx) return;

    if (ctx.state === "suspended") {
      void ctx.resume();
    }

    if (this.playing && this.gain) {
      this.gain.gain.cancelScheduledValues(ctx.currentTime);
      this.gain.gain.setTargetAtTime(this.targetVol, ctx.currentTime, 0.04);
      return;
    }

    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(ctx.destination);

    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 1800;
    filter.Q.value = 0.7;
    filter.connect(gain);

    const source = ctx.createBufferSource();
    source.buffer = this.makeNoiseBuffer(ctx);
    source.loop = true;
    source.connect(filter);
    source.start();

    gain.gain.setTargetAtTime(this.targetVol, ctx.currentTime, 0.05);

    this.gain = gain;
    this.source = source;
    this.playing = true;
  }

  keepAlive() {
    if (!this.playing || !this.ctx || !this.gain) return;
    this.gain.gain.cancelScheduledValues(this.ctx.currentTime);
    this.gain.gain.setTargetAtTime(this.targetVol, this.ctx.currentTime, 0.03);
  }

  stop() {
    if (!this.playing || !this.ctx || !this.gain || !this.source) return;
    const ctx = this.ctx;
    const gain = this.gain;
    const source = this.source;

    gain.gain.cancelScheduledValues(ctx.currentTime);
    gain.gain.setTargetAtTime(0, ctx.currentTime, 0.04);

    this.fadeTimer = window.setTimeout(() => {
      try {
        source.stop();
        source.disconnect();
        gain.disconnect();
      } catch {
        /* already stopped */
      }
      this.source = null;
      this.gain = null;
      this.playing = false;
      this.fadeTimer = null;
    }, 150);
  }

  dispose() {
    this.stop();
    if (this.fadeTimer != null) window.clearTimeout(this.fadeTimer);
    void this.ctx?.close();
    this.ctx = null;
  }
}
