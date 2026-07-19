"use client";

/**
 * Scratch foil SFX from /scratch-fx.mp3.
 *
 * Uses HTMLAudioElement (not Web Audio decode) so play() can stay inside the
 * pointerdown user-gesture — required for iOS Safari / Android Chrome.
 * Call unlockScratchAudio() on form submit to prime autoplay.
 */

const SCRATCH_FX_URL = "/scratch-fx.mp3";

let sharedAudio: HTMLAudioElement | null = null;
let unlocked = false;

function getScratchElement(): HTMLAudioElement | null {
  if (typeof window === "undefined") return null;
  if (sharedAudio) return sharedAudio;

  const audio = new Audio(SCRATCH_FX_URL);
  audio.preload = "auto";
  audio.loop = true;
  audio.volume = 0.85;
  // iOS inline playback (no fullscreen takeover)
  audio.setAttribute("playsinline", "true");
  audio.setAttribute("webkit-playsinline", "true");
  // Do NOT set crossOrigin — it forces a CORS fetch and can block
  // same-origin /public MP3s that don't send ACAO headers.

  sharedAudio = audio;
  return audio;
}

/**
 * Must run from a click/touch handler (form submit).
 * Calls play() immediately (no await) so iOS keeps the user-gesture token.
 */
export function unlockScratchAudio(): void {
  const audio = getScratchElement();
  if (!audio) return;

  try {
    // Near-silent unlock — avoid muted flag (some browsers stick muted=true)
    audio.muted = false;
    audio.volume = 0.01;
    const playPromise = audio.play();
    if (playPromise && typeof playPromise.then === "function") {
      playPromise
        .then(() => {
          audio.pause();
          try {
            audio.currentTime = 0;
          } catch {
            /* ignore seek errors on some mobile browsers */
          }
          audio.volume = 0.85;
          unlocked = true;
        })
        .catch(() => {
          audio.volume = 0.85;
          unlocked = true;
        });
    } else {
      audio.pause();
      audio.volume = 0.85;
      unlocked = true;
    }
  } catch {
    audio.volume = 0.85;
    unlocked = true;
  }
}

export class ScratchAudio {
  private fadeTimer: number | null = null;
  private playing = false;

  static unlock = unlockScratchAudio;

  /**
   * Start looping scratch FX. Keep this sync (no await) so the call
   * stays inside the pointerdown gesture on iOS/Android.
   */
  start() {
    if (typeof window === "undefined") return;

    if (this.fadeTimer != null) {
      window.clearTimeout(this.fadeTimer);
      this.fadeTimer = null;
    }

    const audio = getScratchElement();
    if (!audio) return;

    audio.muted = false;
    audio.volume = 0.85;

    // If still paused, kick play() now (user gesture).
    if (audio.paused || audio.ended) {
      const p = audio.play();
      if (p) {
        p.then(() => {
          this.playing = true;
          unlocked = true;
        }).catch(() => {
          // One more unlock attempt then play (still in gesture chain if sync path)
          this.playing = false;
        });
      } else {
        this.playing = true;
      }
    } else {
      this.playing = true;
    }
  }

  /** Keep audible while the finger is moving. */
  keepAlive() {
    const audio = getScratchElement();
    if (!audio) return;
    audio.muted = false;
    audio.volume = 0.85;
    if (audio.paused) {
      void audio.play().catch(() => {});
    }
    this.playing = true;
  }

  stop() {
    const audio = getScratchElement();
    if (!audio) return;

    // Soft stop: pause quickly so the next stroke can restart cleanly
    if (this.fadeTimer != null) {
      window.clearTimeout(this.fadeTimer);
    }

    this.fadeTimer = window.setTimeout(() => {
      try {
        if (!audio.paused) audio.pause();
      } catch {
        /* ignore */
      }
      this.playing = false;
      this.fadeTimer = null;
    }, 40);
  }

  dispose() {
    if (this.fadeTimer != null) {
      window.clearTimeout(this.fadeTimer);
      this.fadeTimer = null;
    }
    const audio = getScratchElement();
    if (audio && !audio.paused) {
      try {
        audio.pause();
      } catch {
        /* ignore */
      }
    }
    this.playing = false;
  }
}

/** Create the element and start network buffering (no play — safe outside gestures). */
export function preloadScratchAudio(): void {
  const audio = getScratchElement();
  if (!audio) return;
  try {
    audio.load();
  } catch {
    /* ignore */
  }
}
