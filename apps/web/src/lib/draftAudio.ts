export type DraftAudioController = {
  ctx: AudioContext;
};

function rampGain(
  gain: GainNode,
  args: { at: number; attackMs: number; holdMs: number; releaseMs: number; peak: number }
) {
  const a = args.at;
  const attack = args.attackMs / 1000;
  const hold = args.holdMs / 1000;
  const release = args.releaseMs / 1000;
  gain.gain.cancelScheduledValues(a);
  gain.gain.setValueAtTime(0.0001, a);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, args.peak), a + attack);
  gain.gain.setValueAtTime(Math.max(0.0001, args.peak), a + attack + hold);
  gain.gain.exponentialRampToValueAtTime(0.0001, a + attack + hold + release);
}

function playTone(
  ctx: AudioContext,
  args: { hz: number; at: number; ms: number; gain: number }
) {
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(args.hz, args.at);

  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, args.at);

  osc.connect(g);
  g.connect(ctx.destination);

  // Slight envelope to avoid clicks.
  rampGain(g, {
    at: args.at,
    attackMs: 6,
    holdMs: Math.max(10, args.ms - 14),
    releaseMs: 8,
    peak: Math.max(0.0001, args.gain)
  });

  osc.start(args.at);
  osc.stop(args.at + args.ms / 1000);
}

export function createDraftAudioController(): DraftAudioController | null {
  if (typeof window === "undefined") return null;
  const Ctx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  try {
    return { ctx: new Ctx() };
  } catch {
    return null;
  }
}

export async function unlockDraftAudio(controller: DraftAudioController | null) {
  const ctx = controller?.ctx;
  if (!ctx) return;
  if (ctx.state === "suspended") {
    try {
      await ctx.resume();
    } catch {
      // best-effort; if the browser blocks it we just stay silent
    }
  }
}

export async function closeDraftAudio(controller: DraftAudioController | null) {
  const ctx = controller?.ctx;
  if (!ctx) return;
  try {
    await ctx.close();
  } catch {
    // ignore
  }
}

export function playCountdownBeep(controller: DraftAudioController | null) {
  const ctx = controller?.ctx;
  if (!ctx) return;
  const t = ctx.currentTime;
  // Slightly louder/longer to be audible on laptops without being jarring.
  playTone(ctx, { hz: 880, at: t, ms: 90, gain: 0.075 });
}

export function playTurnStartChime(controller: DraftAudioController | null) {
  const ctx = controller?.ctx;
  if (!ctx) return;
  const t = ctx.currentTime;
  // Two-note chime: ~660Hz -> ~880Hz.
  playTone(ctx, { hz: 660, at: t, ms: 120, gain: 0.065 });
  playTone(ctx, { hz: 880, at: t + 0.14, ms: 160, gain: 0.075 });
}
