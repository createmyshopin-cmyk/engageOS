"use client";

/**
 * Scratch foil SFX from /scratch-fx.mp3 — loops while the finger moves,
 * fades out on pointer up. Works on Chrome, Safari, Firefox, Android, iOS.
 *
 * iOS Safari only unlocks AudioContext inside a user gesture. Call
 * unlockScratchAudio() on form submit / first scratch tap.
 */

type WebkitWindow = Window & {
  webkitAudioContext?: typeof AudioContext;
};

const SCRATCH_FX_URL = "/scratch-fx.mp3";

let sharedCtx: AudioContext | null = null;
let unlocked = false;
let fxBuffer: AudioBuffer | null = null;
let fxLoadPromise: Promise<AudioBuffer | null> | null = null;

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

async function loadScratchFxBuffer(ctx: AudioContext): Promise<AudioBuffer | null> {
  if (fxBuffer) return fxBuffer;
  if (fxLoadPromise) return fxLoadPromise;

  fxLoadPromise = (async () => {
    try {
      const res = await fetch(SCRATCH_FX_URL, { cache: "force-cache" });
      if (!res.ok) return null;
      const raw = await res.arrayBuffer();
      const decoded = await ctx.decodeAudioData(raw.slice(0));
      fxBuffer = decoded;
      return decoded;
    } catch {
      return null;
    } finally {
      // Allow retry if first attempt failed before decode completed
      if (!fxBuffer) fxLoadPromise = null;
    }
  })();

  return fxLoadPromise;
}

/** Synthetic foil noise — only used if the MP3 cannot be decoded. */
function makeNoiseBuffer(ctx: AudioContext): AudioBuffer {
  const len = Math.max(1, Math.floor(ctx.sampleRate * 0.5));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const white = Math.random() * 2 - 1;
    last = (last + 0.028 * white) / 1.028;
    data[i] = Math.max(-1, Math.min(1, last * 3.2));
  }
  return buf;
}

/** Resume / unlock audio + prefetch MP3 — must run from a click/touch handler on iOS. */
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
    // Warm the real scratch FX so the first stroke has no delay
    void loadScratchFxBuffer(ctx);
  } catch {
    /* ignore — will retry on scratch */
  }
}

export class ScratchAudio {
  private gain: GainNode | null = null;
  private source: AudioBufferSourceNode | null = null;
  private playing = false;
  private fadeTimer: number | null = null;
  /** Louder for real MP3; still soft enough for mobile speakers. */
  private readonly targetVol = 0.55;

  static unlock = unlockScratchAudio;

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

    // Already looping — just bring volume back up
    if (this.playing && this.gain) {
      this.gain.gain.cancelScheduledValues(ctx.currentTime);
      this.gain.gain.setTargetAtTime(this.targetVol, ctx.currentTime, 0.03);
      return;
    }

    const buffer = (await loadScratchFxBuffer(ctx)) ?? makeNoiseBuffer(ctx);

    try {
      const gain = ctx.createGain();
      gain.gain.value = 0;
      gain.connect(ctx.destination);

      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      // Slightly faster playback = snappier foil feel while dragging
      source.playbackRate.value = buffer === fxBuffer ? 1.05 : 1;
      source.connect(gain);
      source.start(0);

      gain.gain.setTargetAtTime(this.targetVol, ctx.currentTime, 0.035);

      this.gain = gain;
      this.source = source;
      this.playing = true;
    } catch {
      this.playing = false;
    }
  }

  /** Keep the loop audible while the finger is moving. */
  keepAlive() {
    const ctx = getAudioContext();
    if (!this.playing || !ctx || !this.gain) return;
    if (ctx.state === "suspended") {
      void ctx.resume();
    }
    this.gain.gain.cancelScheduledValues(ctx.currentTime);
    this.gain.gain.setTargetAtTime(this.targetVol, ctx.currentTime, 0.02);
  }

  stop() {
    const ctx = getAudioContext();
    if (!this.playing || !ctx || !this.gain || !this.source) return;
    const gain = this.gain;
    const source = this.source;

    gain.gain.cancelScheduledValues(ctx.currentTime);
    gain.gain.setTargetAtTime(0, ctx.currentTime, 0.03);

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
    }, 120);
  }

  dispose() {
    this.stop();
    if (this.fadeTimer != null) window.clearTimeout(this.fadeTimer);
  }
}
