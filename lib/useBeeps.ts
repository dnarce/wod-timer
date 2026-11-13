"use client";
import { useEffect, useRef } from "react";
import { beep } from "./beep";
import { viewOf, type TimerState } from "./state";

/**
 * Beeps de los timers en curso: los últimos 3 s de cada tramo, el arranque de cada tramo y el fin.
 * Suena en el celular del profe (junto a su música); la tele no emite sonido.
 */
export function useBeeps(timers: TimerState[], now: number, enabled: boolean) {
  const beeped = useRef(new Map<string, string>());
  const lastPhase = useRef(new Map<string, number>());

  useEffect(() => {
    if (!enabled || !now) return;
    for (const t of timers) {
      const v = viewOf(t, now);
      if (v.finished) {
        if (beeped.current.get(t.id) !== "end") {
          // Sólo suena si terminó hace instantes (no al abrir la página con un timer ya terminado).
          if (t.elapsedBase > 0 || t.resumedAt !== null) {
            if (v.finishedForMs < 3000) beep("end");
          }
          beeped.current.set(t.id, "end");
        }
        continue;
      }
      if (t.resumedAt === null) continue; // en pausa o a cero: no suena
      const prev = lastPhase.current.get(t.id);
      if (prev !== undefined && prev !== v.phaseIndex) beep("go");
      lastPhase.current.set(t.id, v.phaseIndex);
      if (!v.phase.up && v.secLeftInPhase >= 1 && v.secLeftInPhase <= 3) {
        const k = `${v.phaseIndex}:${v.secLeftInPhase}`;
        if (beeped.current.get(t.id) !== k) {
          beeped.current.set(t.id, k);
          beep("tick");
        }
      }
    }
  }, [timers, now, enabled]);
}
