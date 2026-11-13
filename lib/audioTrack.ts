"use client";
// Audio con el celular bloqueado: se arma UNA pista de audio con todos los beeps de los timers en curso
// (ticks de los últimos 5 s, largadas y final, cada uno en su segundo exacto) y se reproduce en un <audio>.
// Un <audio> sigue sonando con la pantalla bloqueada (WebAudio y los timers de JS, no).
import { soundBuffer } from "./beep";
import type { SoundEvent } from "./soundEvents";

const RATE = 16_000; // mono 16 bit: alcanza para beeps de 1 kHz y mantiene chica la pista
const MAX_SEC = 45 * 60; // largo máximo de la pista; si el timer es más largo se rearma al terminar
const CHUNK_SEC = 120; // se renderiza de a tramos para no juntar todo en memoria

function wavHeader(samples: number): ArrayBuffer {
  const h = new ArrayBuffer(44);
  const v = new DataView(h);
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF");
  v.setUint32(4, 36 + samples * 2, true);
  str(8, "WAVEfmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, RATE, true);
  v.setUint32(28, RATE * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, "data");
  v.setUint32(40, samples * 2, true);
  return h;
}

async function render(events: SoundEvent[], seconds: number): Promise<Blob | null> {
  const [tick, go] = await Promise.all([soundBuffer("tick"), soundBuffer("go")]);
  if (!tick || !go) return null;
  const OAC = window.OfflineAudioContext ?? (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext }).webkitOfflineAudioContext;
  const total = Math.ceil(seconds * RATE);
  const parts: BlobPart[] = [wavHeader(total)];
  for (let c0 = 0; c0 < total; c0 += CHUNK_SEC * RATE) {
    const n = Math.min(CHUNK_SEC * RATE, total - c0);
    const t0 = c0 / RATE;
    const ctx = new OAC(1, n, RATE);
    for (const e of events) {
      const buf = e.kind === "tick" ? tick : go;
      const at = e.atMs / 1000;
      if (at >= t0 + n / RATE || at + buf.duration / e.rate <= t0) continue;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = e.rate; // altura propia de cada timer
      src.connect(ctx.destination);
      src.start(Math.max(0, at - t0), Math.max(0, t0 - at) * e.rate);
    }
    const data = (await ctx.startRendering()).getChannelData(0);
    const pcm = new Int16Array(n);
    for (let i = 0; i < n; i++) pcm[i] = Math.max(-1, Math.min(1, data[i])) * 32767;
    parts.push(pcm.buffer);
  }
  return new Blob(parts, { type: "audio/wav" });
}

let el: HTMLAudioElement | null = null;
let url: string | null = null;
let drift: ReturnType<typeof setInterval> | null = null;

function element(): HTMLAudioElement {
  if (!el) {
    el = new Audio();
    el.preload = "auto";
  }
  return el;
}

/** Hay que llamarlo dentro de un toque: así el navegador deja reproducir después sin otro toque. */
export function unlockTrack() {
  try {
    const a = element();
    if (!a.paused || a.src) return;
    a.src = URL.createObjectURL(new Blob([wavHeader(800), new Int16Array(800).buffer], { type: "audio/wav" }));
    a.play().then(() => a.pause()).catch(() => {});
  } catch {}
}

export function stopTrack() {
  if (drift) clearInterval(drift);
  drift = null;
  if (el) {
    el.pause();
    if (url) URL.revokeObjectURL(url);
    url = null;
    el.removeAttribute("src");
    el.load();
  }
  if ("mediaSession" in navigator) navigator.mediaSession.playbackState = "none";
}

/**
 * Arma la pista desde `t0` (hora del servidor) y la reproduce. Devuelve false si no pudo sonar
 * (entonces los beeps normales de la página quedan de respaldo).
 */
export async function playTrack(events: SoundEvent[], t0: number, now: () => number, cancelled: () => boolean, onEnded: () => void): Promise<boolean> {
  try {
    const last = events[events.length - 1].atMs / 1000;
    const blob = await render(events, Math.min(MAX_SEC, last + 1));
    if (!blob || cancelled()) return false;
    const a = element();
    if (drift) clearInterval(drift);
    if (url) URL.revokeObjectURL(url);
    url = URL.createObjectURL(blob);
    a.onended = onEnded;
    a.src = url;
    await a.play();
    // El arranque tarda un poco: se salta al segundo que corresponde ahora.
    const at = () => (now() - t0) / 1000;
    a.currentTime = at();
    drift = setInterval(() => {
      if (Math.abs(a.currentTime - at()) > 0.2) a.currentTime = at();
    }, 3000);
    if ("mediaSession" in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({ title: "WOD TV Timer", artist: "Timers en curso" });
      navigator.mediaSession.playbackState = "playing";
    }
    return !cancelled();
  } catch {
    return false;
  }
}
