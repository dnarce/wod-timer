// Estado compartido entre celular y tele. El celular es la fuente de verdad;
// la tele sólo renderiza. Todos los tiempos son "hora del servidor" (ms epoch)
// para que dos dispositivos con relojes distintos vean lo mismo.

import { buildPhases, viewAt, type Phase, type TimerConfig, type View } from "./engine.ts";

export const MAX_TIMERS = 3;
export const FIN_VISIBLE_MS = 10_000;

export const COLORS = [
  { id: "volt", hex: "#D4FF00", label: "Volt" },
  { id: "cian", hex: "#22D3EE", label: "Cian" },
  { id: "magenta", hex: "#FF3D8B", label: "Magenta" },
  { id: "naranja", hex: "#FF6B1A", label: "Naranja" },
  { id: "violeta", hex: "#9B6BFF", label: "Violeta" },
] as const;

export type ViewMode = "plani" | "timers" | "split";
export type Theme = "noche" | "dia";

export type TimerState = {
  id: string;
  name: string;
  color: string;
  config: TimerConfig;
  precount: boolean;
  onTv: boolean;
  elapsedBase: number; // ms acumulados hasta la última pausa
  resumedAt: number | null; // hora del servidor en que arrancó el tramo actual
};

export type SessionState = {
  rev: number;
  /** Celular que tiene el control (id propio de cada celular). null = nadie: la tele muestra el QR. */
  controller?: string | null;
  /** La sesión se cerró desde /sesiones: los celulares se despiden y la tele pide una sesión nueva. */
  closed?: boolean;
  view: ViewMode;
  theme: Theme;
  /** Recorta las barras de arriba de la plani (semanas y días), como su modo pantalla completa. */
  planiCrop?: boolean;
  timers: TimerState[];
};

export type Status = "ready" | "running" | "paused" | "finished";

export const emptyState = (): SessionState => ({ rev: 0, controller: null, view: "plani", theme: "noche", timers: [] });

export const phasesOf = (t: TimerState): Phase[] => buildPhases(t.config, t.precount);

export const elapsedOf = (t: TimerState, now: number): number =>
  t.elapsedBase + (t.resumedAt === null ? 0 : Math.max(0, now - t.resumedAt));

export function viewOf(t: TimerState, now: number): View {
  return viewAt(phasesOf(t), elapsedOf(t, now));
}

export function statusOf(t: TimerState, now: number): Status {
  const v = viewOf(t, now);
  if (v.finished) return "finished";
  if (t.resumedAt !== null) return "running";
  return t.elapsedBase > 0 ? "paused" : "ready";
}

// --- Transiciones (devuelven un timer nuevo) ---

export function startTimer(t: TimerState, now: number): TimerState {
  if (statusOf(t, now) === "finished") t = resetTimer(t);
  if (t.resumedAt !== null) return t;
  return { ...t, resumedAt: now, onTv: true };
}

export function pauseTimer(t: TimerState, now: number): TimerState {
  if (t.resumedAt === null) return t;
  return { ...t, elapsedBase: elapsedOf(t, now), resumedAt: null };
}

export function resetTimer(t: TimerState): TimerState {
  return { ...t, elapsedBase: 0, resumedAt: null };
}

/** Suma/resta ms (±10 s). No deja bajar de 0 ni pasar del total. */
export function nudgeTimer(t: TimerState, now: number, deltaMs: number): TimerState {
  const total = viewAt(phasesOf(t), 0).totalMs;
  const next = Math.min(total, Math.max(0, elapsedOf(t, now) + deltaMs));
  return t.resumedAt === null ? { ...t, elapsedBase: next } : { ...t, elapsedBase: next, resumedAt: now };
}

/** Salta al comienzo de la fase siguiente. */
export function skipPhase(t: TimerState, now: number): TimerState {
  const phases = phasesOf(t);
  const v = viewAt(phases, elapsedOf(t, now));
  if (v.finished) return t;
  const startOfNext = phases.slice(0, v.phaseIndex + 1).reduce((a, p) => a + p.durSec * 1000, 0);
  return t.resumedAt === null ? { ...t, elapsedBase: startOfNext } : { ...t, elapsedBase: startOfNext, resumedAt: now };
}

// --- Qué muestra la tele ---

export type TvLayout = {
  mode: ViewMode; // lo que realmente se muestra (puede degradar a plani)
  timers: TimerState[];
};

/** Un timer sale de la tele 10 s después de terminar; si no queda ninguno, vuelve la plani. */
export function tvLayout(s: SessionState, now: number): TvLayout {
  const visible = s.timers.filter((t) => {
    if (!t.onTv) return false;
    const v = viewOf(t, now);
    return !(v.finished && v.finishedForMs > FIN_VISIBLE_MS);
  });
  if (s.view === "plani" || visible.length === 0) return { mode: "plani", timers: [] };
  return { mode: s.view, timers: visible };
}

let counter = 0;
export const newId = () => `t${Date.now().toString(36)}${(counter++).toString(36)}`;

export const defaultConfig = (kind: TimerConfig["kind"]): TimerConfig => {
  switch (kind) {
    case "regresiva":
      return { kind, totalSec: 15 * 60 };
    case "amrap":
      return { kind, blockSec: 5 * 60, blocks: 3, restSec: 60 };
    case "emom":
      return { kind, everySec: 60, rounds: 12 };
    case "tabata":
      return { kind, workSec: 20, restSec: 10, rounds: 8 };
    case "fortime":
      return { kind, capSec: 12 * 60 };
  }
};

export const newTimer = (n: number): TimerState => ({
  id: newId(),
  name: ["CROSSFIT", "FUNCIONAL", "GAP"][n] ?? `TIMER ${n + 1}`,
  color: COLORS[n % COLORS.length].hex,
  config: defaultConfig("emom"),
  precount: true,
  onTv: false,
  elapsedBase: 0,
  resumedAt: null,
});
