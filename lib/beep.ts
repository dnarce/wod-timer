"use client";
// Beeps con WebAudio. Los navegadores bloquean el audio hasta que alguien toca la pantalla.
let ctx: AudioContext | null = null;

export function audioReady(): boolean {
  return !!ctx && ctx.state === "running";
}

export function unlockAudio() {
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx ??= new AC();
    void ctx.resume();
  } catch {}
}

export function beep(kind: "tick" | "go" | "end") {
  if (!ctx || ctx.state !== "running") return;
  const freq = kind === "tick" ? 880 : kind === "go" ? 1320 : 440;
  const dur = kind === "end" ? 1.1 : kind === "go" ? 0.5 : 0.14;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = kind === "end" ? "sawtooth" : "square";
  o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.35, ctx.currentTime + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
  o.connect(g).connect(ctx.destination);
  o.start();
  o.stop(ctx.currentTime + dur + 0.05);
}
