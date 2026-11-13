// Motor de timers: funciones puras. Dada una config y los ms transcurridos,
// devuelve qué mostrar. No sabe nada de React, red ni relojes.

export type TimerConfig =
  | { kind: "regresiva"; totalSec: number }
  | { kind: "amrap"; blockSec: number; blocks: number; restSec: number }
  | { kind: "emom"; everySec: number; rounds: number }
  | { kind: "tabata"; workSec: number; restSec: number; rounds: number }
  | { kind: "fortime"; capSec: number };

export type Phase = {
  type: "precount" | "work" | "rest";
  durSec: number;
  label: string; // BLOQUE, MINUTO, TRABAJO, DESCANSO...
  index: number; // 1-based dentro de su grupo (bloque 2, minuto 7)
  of: number; // total del grupo (3 bloques, 12 minutos)
  up?: boolean; // cuenta hacia arriba (for time)
};

export const PRECOUNT_SEC = 10;

export function buildPhases(cfg: TimerConfig, precount: boolean): Phase[] {
  const out: Phase[] = [];
  if (precount) {
    out.push({ type: "precount", durSec: PRECOUNT_SEC, label: "ARRANCA EN", index: 1, of: 1 });
  }
  switch (cfg.kind) {
    case "regresiva":
      out.push({ type: "work", durSec: cfg.totalSec, label: "RESTA", index: 1, of: 1 });
      break;
    case "amrap":
      for (let i = 1; i <= cfg.blocks; i++) {
        out.push({ type: "work", durSec: cfg.blockSec, label: "BLOQUE", index: i, of: cfg.blocks });
        if (i < cfg.blocks && cfg.restSec > 0) {
          out.push({ type: "rest", durSec: cfg.restSec, label: "DESCANSO", index: i, of: cfg.blocks - 1 });
        }
      }
      break;
    case "emom":
      for (let i = 1; i <= cfg.rounds; i++) {
        out.push({ type: "work", durSec: cfg.everySec, label: "MINUTO", index: i, of: cfg.rounds });
      }
      break;
    case "tabata":
      for (let i = 1; i <= cfg.rounds; i++) {
        out.push({ type: "work", durSec: cfg.workSec, label: "TRABAJO", index: i, of: cfg.rounds });
        if (cfg.restSec > 0) {
          out.push({ type: "rest", durSec: cfg.restSec, label: "DESCANSO", index: i, of: cfg.rounds });
        }
      }
      break;
    case "fortime":
      out.push({ type: "work", durSec: cfg.capSec, label: "CRONO", index: 1, of: 1, up: true });
      break;
  }
  return out.filter((p) => p.durSec > 0);
}

export function totalSec(phases: Phase[]): number {
  return phases.reduce((a, p) => a + p.durSec, 0);
}

export type View = {
  finished: boolean;
  finishedForMs: number; // ms desde que terminó (0 si sigue en curso)
  phase: Phase;
  phaseIndex: number;
  displayMs: number; // lo que muestran los números grandes
  phaseElapsedMs: number;
  totalElapsedMs: number; // acotado al total
  totalMs: number;
  next: Phase | null;
  /** Segundos enteros que faltan para el final de la fase (para los beeps). */
  secLeftInPhase: number;
  /** Progreso 0..1 de cada fase, en el orden de `phases`. */
  progress: number[];
};

export function viewAt(phases: Phase[], elapsedMs: number): View {
  const totalMs = totalSec(phases) * 1000;
  const e = Math.max(0, elapsedMs);
  const finished = e >= totalMs;
  const clamped = Math.min(e, totalMs);

  let acc = 0;
  let idx = phases.length - 1;
  if (!finished) {
    for (let i = 0; i < phases.length; i++) {
      const end = acc + phases[i].durSec * 1000;
      if (clamped < end) {
        idx = i;
        break;
      }
      acc = end;
    }
  } else {
    acc = totalMs - phases[idx].durSec * 1000;
  }

  const phase = phases[idx];
  const phaseElapsedMs = Math.min(clamped - acc, phase.durSec * 1000);
  const phaseLeftMs = phase.durSec * 1000 - phaseElapsedMs;
  const displayMs = phase.up ? phaseElapsedMs : phaseLeftMs;

  let a = 0;
  const progress = phases.map((p) => {
    const start = a;
    a += p.durSec * 1000;
    return Math.min(1, Math.max(0, (clamped - start) / (p.durSec * 1000)));
  });

  return {
    finished,
    finishedForMs: finished ? e - totalMs : 0,
    phase,
    phaseIndex: idx,
    displayMs,
    phaseElapsedMs,
    totalElapsedMs: clamped,
    totalMs,
    next: idx + 1 < phases.length ? phases[idx + 1] : null,
    secLeftInPhase: Math.ceil(phaseLeftMs / 1000),
    progress,
  };
}

/** mm:ss. Sube a h:mm:ss pasada la hora. Redondea hacia arriba como los timers de gimnasio. */
export function fmt(ms: number, up = false): string {
  const s = Math.max(0, up ? Math.floor(ms / 1000) : Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const x = s % 60;
  const two = (n: number) => (n < 10 ? "0" + n : String(n));
  return h > 0 ? `${h}:${two(m)}:${two(x)}` : `${two(m)}:${two(x)}`;
}

export function fmtShort(sec: number): string {
  const m = Math.floor(sec / 60);
  const x = sec % 60;
  return `${m}:${x < 10 ? "0" : ""}${x}`;
}

export function describe(cfg: TimerConfig): string {
  switch (cfg.kind) {
    case "regresiva":
      return `CUENTA REGRESIVA ${fmtShort(cfg.totalSec)}`;
    case "amrap":
      return `AMRAP · ${cfg.blocks} × ${fmtShort(cfg.blockSec)}${cfg.blocks > 1 && cfg.restSec ? ` · DESC ${fmtShort(cfg.restSec)}` : ""}`;
    case "emom":
      return `EMOM ${cfg.rounds} · CADA ${fmtShort(cfg.everySec)}`;
    case "tabata":
      return `TABATA ${cfg.rounds} × ${fmtShort(cfg.workSec)} / ${fmtShort(cfg.restSec)}`;
    case "fortime":
      return `FOR TIME · CAP ${fmtShort(cfg.capSec)}`;
  }
}
