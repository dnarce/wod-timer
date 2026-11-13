"use client";
// Beeps con WebAudio. Los navegadores bloquean el audio hasta que alguien toca la pantalla.
let ctx: AudioContext | null = null;

// Sonidos grabados (public/sounds). Si todavía no cargaron, se usa el oscilador de abajo.
// tick: cada segundo de la cuenta de 5 s · go: largada de cada tramo · end: fin del timer.
const FILES = { tick: "/sounds/tick.wav", go: "/sounds/go.wav", end: "/sounds/go.wav" } as const;
const buffers = new Map<string, AudioBuffer>();
const loads = new Map<string, Promise<AudioBuffer | null>>();

function load(url: string): Promise<AudioBuffer | null> {
  const c = ctx;
  if (!c) return Promise.resolve(null);
  let p = loads.get(url);
  if (!p) {
    p = fetch(url)
      .then((r) => r.arrayBuffer())
      .then((b) => c.decodeAudioData(b))
      .then((buf) => {
        buffers.set(url, buf);
        return buf;
      })
      .catch(() => {
        loads.delete(url); // reintenta en el próximo intento
        return null;
      });
    loads.set(url, p);
  }
  return p;
}

function preload() {
  for (const url of new Set(Object.values(FILES))) void load(url);
}

/** Buffer decodificado de un sonido (para armar la pista de audio de fondo). */
export function soundBuffer(kind: "tick" | "go" | "end"): Promise<AudioBuffer | null> {
  return load(FILES[kind]);
}

export function audioReady(): boolean {
  return !!ctx && ctx.state === "running";
}

export function unlockAudio() {
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx ??= new AC();
    void ctx.resume();
    preload();
  } catch {}
}

/** `rate` cambia la altura (1 = normal): sirve para distinguir varios timers. */
export function beep(kind: "tick" | "go" | "end", rate = 1) {
  if (!ctx || ctx.state !== "running") return;
  const buf = buffers.get(FILES[kind]);
  if (buf) {
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    src.connect(ctx.destination);
    src.start();
    return;
  }
  const freq = (kind === "tick" ? 880 : kind === "go" ? 1320 : 440) * rate;
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
