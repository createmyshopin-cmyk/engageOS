/**
 * Tiny synthesized win chime via Web Audio — zero network, ~no bundle cost.
 * Only plays when the merchant enabled Reward Sound; failures are silent.
 * Runs inside the scratch-reveal user gesture, so autoplay policy allows it.
 */
export function playRewardChime() {
  try {
    const Ctx =
      window.AudioContext ??
      (window as Window & { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    if (ctx.state === "suspended") {
      ctx.resume();
    }
    const notes = [523.25, 659.25, 783.99]; // C5 E5 G5
    const start = ctx.currentTime;
    for (let i = 0; i < notes.length; i += 1) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = notes[i];
      const t = start + i * 0.09;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.12, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.5);
    }
    setTimeout(() => void ctx.close(), 1200);
  } catch {
    /* audio unavailable — stay silent */
  }
}
