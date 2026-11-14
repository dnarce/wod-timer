"use client";
// Beeps con WebAudio. Los navegadores bloquean el audio hasta que alguien toca la pantalla.
let ctx: AudioContext | null = null;

// Un único sonido grabado (public/sounds): 3 beeps cortos y un beep largo en el segundo 3.
// Si todavía no cargó, se usa el oscilador de abajo.
const FILE = "/sounds/start.wav";
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
  void load(FILE);
}

/** Buffer decodificado del sonido (para armar la pista de audio de fondo). */
export function soundBuffer(): Promise<AudioBuffer | null> {
  return load(FILE);
}

export function audioReady(): boolean {
  return !!ctx && ctx.state === "running";
}

// Tipo de sesión de audio (Safari/iOS). "ambient" se mezcla con la música de otra app (Spotify) en vez de pausarla,
// pero no suena con la pantalla bloqueada; "playback" suena bloqueado y le corta la música a las demás apps.
let sessionType: "ambient" | "playback" = "ambient";

export function setAudioSession(type: "ambient" | "playback") {
  sessionType = type;
  try {
    const s = (navigator as unknown as { audioSession?: { type: string } }).audioSession;
    if (s && s.type !== type) s.type = type;
  } catch {}
}

export function unlockAudio() {
  setAudioSession(sessionType); // antes de crear el AudioContext: si no, iOS pausa la música al primer toque
  try {
    watchVisibility();
    if (stale && ctx) {
      // La página estuvo oculta (pantalla bloqueada u otra app): en iOS el motor de audio puede quedar mudo aunque
      // diga que está andando. Dentro de un toque se arma uno nuevo, que es lo único que lo recupera seguro.
      const old = ctx;
      ctx = null;
      keepAliveSrc = null;
      void old.close().catch(() => {});
    }
    stale = false;
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx ??= new AC();
    void ctx.resume();
    preload();
    syncKeepAlive();
  } catch {}
}

// Al bloquear la pantalla iOS interrumpe el audio de la página y al volver no lo retoma solo.
let stale = false;
let watching = false;

function watchVisibility() {
  if (watching) return;
  watching = true;
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") {
      stale = true;
      return;
    }
    // De vuelta en pantalla: se reinicia el motor sin esperar un toque (si no alcanza, el próximo toque lo rearma).
    setAudioSession(sessionType);
    const c = ctx;
    if (!c) return;
    c.suspend()
      .catch(() => {})
      .then(() => c.resume())
      .catch(() => {});
  });
}

// Con un timer corriendo se mantiene la salida de audio despierta con un ruido inaudible (-80 dB).
// Sin esto, tras ~10 s de silencio el celular duerme la salida y se pierden los beeps que siguen a un
// silencio largo (el final de los 20 s de trabajo de un tabata), pero no los que siguen a uno corto (descansos).
let keepAliveWanted = false;
let keepAliveSrc: AudioBufferSourceNode | null = null;

function syncKeepAlive() {
  if (!ctx) return;
  if (keepAliveWanted && !keepAliveSrc) {
    const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * 1e-4;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.connect(ctx.destination);
    src.start();
    keepAliveSrc = src;
  } else if (!keepAliveWanted && keepAliveSrc) {
    try {
      keepAliveSrc.stop();
    } catch {}
    keepAliveSrc.disconnect();
    keepAliveSrc = null;
  }
}

export function keepAudioAlive(on: boolean) {
  keepAliveWanted = on;
  try {
    syncKeepAlive();
    if (on && ctx && ctx.state !== "running") void ctx.resume();
  } catch {}
}

// Sonidos en curso por timer, para cortarlos si se pausa o se silencia a mitad de la cuenta.
const active = new Map<string, Set<AudioScheduledSourceNode>>();

export function cancelBeeps(owner?: string) {
  for (const [id, set] of active) {
    if (owner !== undefined && id !== owner) continue;
    for (const n of set) {
      try {
        n.stop();
      } catch {}
    }
    active.delete(id);
  }
}

function track(owner: string, n: AudioScheduledSourceNode) {
  let set = active.get(owner);
  if (!set) active.set(owner, (set = new Set()));
  set.add(n);
  n.onended = () => set.delete(n);
}

/** Reproduce la cuenta (3 beeps + largo) desde `skipSec` segundos adentro del sonido. */
export function beep(skipSec = 0, owner = "") {
  if (!ctx) return;
  if (ctx.state !== "running") {
    // El sistema suspendió el audio: se intenta retomar y sonar igual, salvo que tarde demasiado (sonaría a destiempo).
    const asked = performance.now();
    void ctx
      .resume()
      .then(() => {
        const late = (performance.now() - asked) / 1000;
        if (ctx?.state === "running" && late < 0.4) play(skipSec + late, owner);
      })
      .catch(() => {});
    return;
  }
  play(skipSec, owner);
}

function play(skipSec: number, owner: string) {
  if (!ctx) return;
  const buf = buffers.get(FILE);
  if (buf) {
    if (skipSec >= buf.duration) return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    src.start(0, skipSec);
    track(owner, src);
    return;
  }
  // Sin el sonido grabado: beeps de oscilador en los mismos segundos (0, 1, 2 cortos y 3 largo).
  for (const [at, dur] of [[0, 0.14], [1, 0.14], [2, 0.14], [3, 0.9]] as const) {
    if (at < skipSec) continue;
    const t0 = ctx.currentTime + (at - skipSec);
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "square";
    o.frequency.value = at === 3 ? 1320 : 880;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.35, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(ctx.destination);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
    track(owner, o);
  }
}
