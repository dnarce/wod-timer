"use client";
import { useEffect, useRef, useState } from "react";
import { beep, cancelBeeps, keepAudioAlive } from "./beep";
import { serverNow } from "./clock";
import { playTrack, stopTrack } from "./audioTrack";
import { COUNTDOWN_SEC, soundEvents } from "./soundEvents";
import { viewOf, type TimerState } from "./state";

/**
 * Beeps de los timers en curso: 3 s antes de cada cambio de tramo (precuenta, trabajo, descanso) y del final arranca el
 * sonido (3 beeps cortos + uno largo que cae justo en el cambio). En un cronómetro hacia arriba suena sólo el largo, al final.
 * Suena en la tele o en el celular del profe, según elija en el control (nunca en los dos).
 */
export function useBeeps(timers: TimerState[], now: number, enabled: boolean) {
  const counted = useRef(new Map<string, number>()); // timer -> último tramo cuya cuenta ya arrancó
  const lastPhase = useRef(new Map<string, number>());
  const ended = useRef(new Set<string>());

  // Mientras haya un timer sonando en curso, la salida de audio no se duerme entre beeps.
  const running = enabled && timers.some((t) => t.resumedAt !== null && !t.muted);
  useEffect(() => {
    keepAudioAlive(running);
    return () => keepAudioAlive(false);
  }, [running]);

  useEffect(() => {
    if (!enabled) cancelBeeps();
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !now) return;
    for (const t of timers) {
      if (t.muted) {
        cancelBeeps(t.id);
        continue;
      }
      const v = viewOf(t, now);
      if (v.finished) {
        if (!ended.current.has(t.id)) {
          ended.current.add(t.id);
          // Sólo suena si terminó hace instantes (no al abrir la página con un timer ya terminado) y si la cuenta no sonó ya.
          const started = t.elapsedBase > 0 || t.resumedAt !== null;
          if (started && v.finishedForMs < 3000 && counted.current.get(t.id) !== v.phaseIndex) beep(COUNTDOWN_SEC, t.id);
        }
        continue;
      }
      ended.current.delete(t.id);
      if (t.resumedAt === null) {
        // En pausa o a cero: se corta lo que esté sonando y, al seguir, la cuenta se retoma desde donde va.
        cancelBeeps(t.id);
        counted.current.delete(t.id);
        lastPhase.current.delete(t.id);
        continue;
      }
      const prev = lastPhase.current.get(t.id);
      lastPhase.current.set(t.id, v.phaseIndex);
      // Cambió de tramo sin que la cuenta haya sonado (la pantalla estuvo bloqueada): suena al menos el beep largo.
      if (prev !== undefined && prev !== v.phaseIndex && counted.current.get(t.id) !== prev) beep(COUNTDOWN_SEC, t.id);
      // Cuenta de 3 s al final de cada tramo con cuenta regresiva: el sonido entra por el segundo que corresponde.
      const leftMs = v.phase.durSec * 1000 - v.phaseElapsedMs;
      if (!v.phase.up && leftMs > 0 && leftMs <= COUNTDOWN_SEC * 1000 && counted.current.get(t.id) !== v.phaseIndex) {
        counted.current.set(t.id, v.phaseIndex);
        beep(COUNTDOWN_SEC - leftMs / 1000, t.id);
      }
      // Cronómetro hacia arriba: no hay cuenta, así que el beep largo suena al cambiar de tramo (ver arriba) y al terminar.
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
