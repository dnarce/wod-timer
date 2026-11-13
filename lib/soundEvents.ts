// Qué suena y cuándo: función pura, sin audio (la usa la pista de fondo y se prueba aparte).
import { elapsedOf, phasesOf, type TimerState } from "./state.ts";

export const COUNTDOWN_SEC = 3;

/** Cada timer suena con su propia altura (el mismo beep, más agudo o más grave) para distinguirlos con varios en curso. */
const VOICES = [1, 1.26, 0.79]; // 1.er timer normal, 2.º una tercera más agudo, 3.º más grave
export const voiceRate = (index: number) => VOICES[index % VOICES.length];

export type SoundEvent = { atMs: number; kind: "tick" | "go" | "end"; rate: number };

/** Eventos de sonido de los timers en curso, en ms desde `now` (hora del servidor). */
export function soundEvents(timers: TimerState[], now: number): SoundEvent[] {
  const out: SoundEvent[] = [];
  for (const [n, t] of timers.entries()) {
    if (t.resumedAt === null || t.muted) continue;
    const rate = voiceRate(n);
    const el = elapsedOf(t, now);
    const phases = phasesOf(t);
    let end = 0;
    phases.forEach((p, i) => {
      end += p.durSec * 1000;
      if (!p.up) {
        for (let k = COUNTDOWN_SEC; k >= 1; k--) {
          if (k < p.durSec && end - k * 1000 >= el) out.push({ atMs: end - k * 1000 - el, kind: "tick", rate });
        }
      }
      if (end > el) out.push({ atMs: end - el, kind: i === phases.length - 1 ? "end" : "go", rate });
    });
  }
  return out.sort((a, b) => a.atMs - b.atMs);
}

