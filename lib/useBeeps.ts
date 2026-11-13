"use client";
import { useEffect, useRef, useState } from "react";
import { beep } from "./beep";
import { serverNow } from "./clock";
import { playTrack, stopTrack } from "./audioTrack";
import { COUNTDOWN_SEC, soundEvents, voiceRate } from "./soundEvents";
import { viewOf, type TimerState } from "./state";

/**
 * Beeps de los timers en curso: los últimos 5 s de cada tramo (precuenta, trabajo y descanso), el arranque de cada tramo y el fin.
 * Suena en el celular del profe (junto a su música); la tele no emite sonido.
 */
export function useBeeps(timers: TimerState[], now: number, enabled: boolean) {
  const beeped = useRef(new Map<string, string>());
  const lastPhase = useRef(new Map<string, number>());

  useEffect(() => {
    if (!enabled || !now) return;
    for (const [n, t] of timers.entries()) {
      const rate = voiceRate(n);
      const v = viewOf(t, now);
      if (t.muted) continue; // timer silenciado
      if (v.finished) {
        if (beeped.current.get(t.id) !== "end") {
          // Sólo suena si terminó hace instantes (no al abrir la página con un timer ya terminado).
          if (t.elapsedBase > 0 || t.resumedAt !== null) {
            if (v.finishedForMs < 3000) beep("end", rate);
          }
          beeped.current.set(t.id, "end");
        }
        continue;
      }
      if (t.resumedAt === null) continue; // en pausa o a cero: no suena
      const prev = lastPhase.current.get(t.id);
      if (prev !== undefined && prev !== v.phaseIndex) beep("go", rate);
      lastPhase.current.set(t.id, v.phaseIndex);
      // Cuenta de 5 s al final de cada tramo con cuenta regresiva (cuenta previa, trabajo, descanso).
      // En un tramo de 5 s o menos no suena el segundo en que arranca: ahí ya suena la largada.
      if (!v.phase.up && v.secLeftInPhase >= 1 && v.secLeftInPhase <= COUNTDOWN_SEC && v.secLeftInPhase < v.phase.durSec) {
        const k = `${v.phaseIndex}:${v.secLeftInPhase}`;
        if (beeped.current.get(t.id) !== k) {
          beeped.current.set(t.id, k);
          beep("tick", rate);
        }
      }
    }
  }, [timers, now, enabled]);
}

/**
 * Sonido con el celular bloqueado: mantiene una pista de audio con todos los beeps de los timers en curso.
 * Se rearma cada vez que cambia algo (largar, pausar, ±10 s, saltar). Devuelve true si la pista está sonando,
 * y entonces no hacen falta los beeps de la página.
 */
export function useTrackAudio(timers: TimerState[], enabled: boolean): boolean {
  const [active, setActive] = useState(false);
  const [round, setRound] = useState(0); // fuerza rearmar cuando la pista termina
  const ref = useRef(timers);
  useEffect(() => {
    ref.current = timers;
  }, [timers]);
  const key = enabled
    ? timers
        .filter((t) => t.resumedAt !== null && !t.muted)
        .map((t) => `${t.id}:${t.elapsedBase}:${t.resumedAt}:${t.precount}:${JSON.stringify(t.config)}`)
        .join("|")
    : "";

  useEffect(() => {
    let dead = false;
    const t0 = serverNow();
    const events = key ? soundEvents(ref.current, t0) : [];
    if (events.length === 0) {
      stopTrack();
      setActive(false);
      return;
    }
    void playTrack(events, t0, serverNow, () => dead, () => setRound((r) => r + 1)).then((ok) => {
      if (!dead) setActive(ok);
    });
    return () => {
      dead = true;
    };
  }, [key, round]);

  return enabled && active;
}
