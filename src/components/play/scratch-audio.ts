"use client";

/**
 * Cross-platform foil scratch SFX (Chrome, Safari, Firefox, Android, iOS).
 *
 * iOS Safari only unlocks AudioContext inside a user gesture. Call
 * ScratchAudio.unlock() on the first tap (form submit / scratch start).
 * Uses a shared singleton context so unlock persists across the play flow.
 */

type WebkitWindow = Window & {
  webkitAudioContext?: typeof AudioContext;
};

let sharedCtx: AudioContext | null = null;
let unlocked = false;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (sharedCtx && sharedCtx.state !== "closed") return sharedCtx;
  const AC =
    window.AudioContext ||
    (window as WebkitWindow).webkitAudioContext;
  if (!AC) return null;
  try {
    sharedCtx = new AC();
    return sharedCtx;
  } catch {
    return null;
  }
}

/** Resume / unlock audio — must run from a click/touch handler on iOS. */
export async function unlockScratchAudio(): Promise<void> {
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    if (ctx.state === "suspended") {
      await ctx.resume();
    }
    // Silent buffer primes iOS hardware path
    const buf = ctx.createBuffer(1, 1, 22050);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    src.start(0);
    unlocked = true;
  } catch {
    /* ignore — will retry on scratch */
  }
}

export class ScratchAudio {
  private gain: GainNode | null = null;
  private source: AudioBufferSourceNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private playing = false;
  private fadeTimer: number | null = null;
  private readonly targetVol = 0.22;

  static unlock = unlockScratchAudio;

  private makeNoiseBuffer(ctx: AudioContext): AudioBuffer {
    // Longer loop reduces audible seams on mobile
    const len = Math.max(1, Math.floor(ctx.sampleRate * 0.5));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      // Soft brownish noise — closer to foil/paper than white noise
      const white = Math.random() * 2 - 1;
      last = (last + 0.028 * white) / 1.028;
      data[i] = Math.max(-1, Math.min(1, last * 3.2));
    }
    return buf;
  }

  async start() {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    if (this.fadeTimer != null) {
      window.clearTimeout(this.fadeTimer);
      this.fadeTimer = null;
    }

    const ctx = getAudioContext();
    if (!ctx) return;

    try {
      if (ctx.state === "suspended") {
        await ctx.resume();
      }
      if (!unlocked) {
        await unlockScratchAudio();
      }
    } catch {
      return;
    }

    if (this.playing && this.gain) {
      this.gain.gain.cancelScheduledValues(ctx.currentTime);
      this.gain.gain.setTargetAtTime(this.targetVol, ctx.currentTime, 0.03);
      return;
    }

    try {
      const gain = ctx.createGain();
      gain.gain.value = 0;
      gain.connect(ctx.destination);

      const filter = ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.value = 2100;
      filter.Q.value = 0.85;
      filter.connect(gain);

      const source = ctx.createBufferSource();
      source.buffer = this.makeNoiseBuffer(ctx);
      source.loop = true;
      source.connect(filter);
      source.start(0);

      gain.gain.setTargetAtTime(this.targetVol, ctx.currentTime, 0.04);

      this.gain = gain;
      this.filter = filter;
      this.source = source;
      this.playing = true;
    } catch {
      this.playing = false;
    }
  }

  keepAlive() {
    const ctx = getAudioContext();
    if (!this.playing || !ctx || !this.gain) return;
    if (ctx.state === "suspended") {
      void ctx.resume();
    }
    this.gain.gain.cancelScheduledValues(ctx.currentTime);
    this.gain.gain.setTargetAtTime(this.targetVol, ctx.currentTime, 0.025);
  }

  stop() {
    const ctx = getAudioContext();
    if (!this.playing || !ctx || !this.gain || !this.source) return;
    const gain = this.gain;
    const source = this.source;
    const filter = this.filter;

    gain.gain.cancelScheduledValues(ctx.currentTime);
    gain.gain.setTargetAtTime(0, ctx.currentTime, 0.035);

    this.fadeTimer = window.setTimeout(() => {
      try {
        source.stop();
        source.disconnect();
        filter?.disconnect();
        gain.disconnect();
      } catch {
        /* already stopped */
      }
      this.source = null;
      this.filter = null;
      this.gain = null;
      this.playing = false;
      this.fadeTimer = null;
    }, 140);
  }

  dispose() {
    this.stop();
    if (this.fadeTimer != null) window.clearTimeout(this.fadeTimer);
    // Keep shared context alive for the play session — do not close it.
  }
}
