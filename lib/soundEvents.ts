// Qué suena y cuándo: función pura, sin audio (la usa la pista de fondo y se prueba aparte).
import { elapsedOf, phasesOf, type TimerState } from "./state.ts";

/** Segundos del sonido grabado antes de su beep largo: ahí arranca el sonido respecto del cambio de tramo. */
export const COUNTDOWN_SEC = 3;

/**
 * Un único sonido grabado (3 beeps cortos + 1 largo en el segundo 3). Se dispara `COUNTDOWN_SEC` antes de
 * cada cambio de tramo para que el beep largo caiga justo en el cambio. `skipSec` es desde dónde del sonido
 * se reproduce (0 = entero; más si ya se está dentro de la cuenta, o si el tramo dura menos de 3 s).
 */
export type SoundEvent = { atMs: number; skipSec: number };

/** Eventos de sonido de los timers en curso, en ms desde `now` (hora del servidor). */
export function soundEvents(timers: TimerState[], now: number): SoundEvent[] {
  const out: SoundEvent[] = [];
  for (const t of timers) {
    if (t.resumedAt === null || t.muted) continue;
    const el = elapsedOf(t, now);
    let end = 0;
    for (const p of phasesOf(t)) {
      end += p.durSec * 1000;
      if (end <= el) continue;
      // En un cronómetro hacia arriba no hay cuenta regresiva: suena sólo el beep largo, al final.
      const lead = p.up ? 0 : Math.min(COUNTDOWN_SEC, p.durSec);
      const start = end - lead * 1000;
      const skipSec = COUNTDOWN_SEC - lead + Math.max(0, el - start) / 1000;
      out.push({ atMs: Math.max(0, start - el), skipSec });
    }
  }
  return out.sort((a, b) => a.atMs - b.atMs);
}
