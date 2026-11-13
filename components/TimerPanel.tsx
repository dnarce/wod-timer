"use client";
import type { CSSProperties } from "react";
import { describe, fmt, fmtShort, type Phase } from "@/lib/engine";
import { statusOf, viewOf, phasesOf, type TimerState } from "@/lib/state";
import { COND, type ThemeTokens } from "./Stage";

export type PanelSize = "solo" | "two" | "three" | "side";

const Z = {
  two: { pad: "40px 64px 40px 72px", padFlip: "40px 72px 40px 64px", left: 520, gap: 22, chip: 60, mode: 32, label: 40, round: 72, roundOf: 44, seg: 16, next: 30, digits: 440 },
  three: { pad: "22px 56px 22px 64px", padFlip: "22px 64px 22px 56px", left: 480, gap: 12, chip: 44, mode: 24, label: 30, round: 52, roundOf: 32, seg: 12, next: 24, digits: 300 },
};

// Columna del split: se achica según cuántos timers se apilan (1, 2 o 3).
const SIDE = {
  1: { pad: "28px 36px", name: 60, mode: 30, label: 40, digits: 220, bar: 22, next: 28, fin: 200, gap: 14 },
  2: { pad: "16px 28px", name: 44, mode: 22, label: 28, digits: 170, bar: 16, next: 22, fin: 140, gap: 8 },
  3: { pad: "10px 24px", name: 34, mode: 18, label: 22, digits: 120, bar: 12, next: 18, fin: 100, gap: 4 },
} as const;

function nextText(next: Phase | null): string {
  if (!next) return "ÚLTIMO TRAMO";
  if (next.type === "rest") return `SIGUE → DESCANSO ${fmtShort(next.durSec)}`;
  if (next.of > 1) return `SIGUE → ${next.label} ${next.index}`;
  return `SIGUE → ${next.label}`;
}

function Segments({ t, now, th, height }: { t: TimerState; now: number; th: ThemeTokens; height: number }) {
  const phases = phasesOf(t);
  const v = viewOf(t, now);
  return (
    <div style={{ display: "flex", gap: 6, height }}>
      {phases.map((p, i) =>
        p.type === "precount" ? null : (
          <div key={i} style={{ flex: `${p.durSec} 1 0`, borderRadius: 5, background: th.track, overflow: "hidden", display: "flex" }}>
            <div style={{ width: `${v.progress[i] * 100}%`, background: p.type === "rest" ? th.rest : t.color }} />
          </div>
        ),
      )}
    </div>
  );
}

function useParts(t: TimerState, now: number) {
  const v = viewOf(t, now);
  const status = statusOf(t, now);
  const up = !!v.phase.up;
  const precount = v.phase.type === "precount" && !v.finished;
  const digits = fmt(v.displayMs, up);
  const showRound = !precount && v.phase.of > 1;
  return { v, status, up, precount, digits, showRound };
}

// `flip`: espeja la franja (número a la izquierda, datos a la derecha). Se alterna entre timers apilados.
export function TimerPanel({ t, now, th, size, dark, count = 1, flip = false }: { t: TimerState; now: number; th: ThemeTokens; size: PanelSize; dark: boolean; count?: number; flip?: boolean }) {
  const { v, status, precount, digits, showRound } = useParts(t, now);
  const fin = status === "finished";
  const paused = status === "paused";
  const resting = v.phase.type === "rest" && !fin;
  const accent = resting ? th.rest : t.color; // en descanso todo lo "vivo" pasa al color de descanso
  const digitColor = fin ? "#07080B" : resting ? th.rest : dark ? t.color : th.fg;
  const chip: CSSProperties = { background: fin ? "#07080B" : t.color, color: fin ? t.color : "#07080B", borderRadius: 14, padding: "2px 20px", fontFamily: COND, fontWeight: 900, lineHeight: 1.15, letterSpacing: 1 };
  const panel: CSSProperties = {
    position: "relative",
    overflow: "hidden",
    minHeight: 0,
    borderRadius: 32,
    background: fin ? t.color : th.panel,
    color: fin ? "#07080B" : th.fg,
    border: `2px solid ${fin ? t.color : th.line}`,
  };

  if (fin) {
    const sd = SIDE[Math.min(3, Math.max(1, count)) as 1 | 2 | 3];
    const big = size === "three" ? 300 : size === "side" ? sd.fin : size === "two" ? 440 : 520;
    return (
      <div style={{ ...panel, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8 }}>
        <span style={{ fontFamily: COND, fontWeight: 800, fontSize: size === "three" ? 36 : size === "side" ? Math.min(52, sd.name) : 52, letterSpacing: 6 }}>{t.name}</span>
        <span style={{ fontFamily: COND, fontWeight: 900, fontSize: big, lineHeight: 0.85, letterSpacing: -6 }}>FIN</span>
      </div>
    );
  }

  const pauseBadge = paused && (
    <span className="pulse-pause" style={{ fontFamily: COND, fontWeight: 800, fontSize: 28, letterSpacing: 4, padding: "2px 16px", borderRadius: 999, border: `3px solid ${th.fg}` }}>
      EN PAUSA
    </span>
  );

  const pre = phasesOf(t)[0]?.type === "precount" ? 10_000 : 0;
  if (size === "solo") {
    return (
      <div style={{ ...panel, display: "flex", flexDirection: "column", padding: "40px 80px 48px", border: "none", background: "transparent" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 28, marginTop: 8 }}>
          <span style={{ ...chip, fontSize: 56 }}>{t.name}</span>
          <span style={{ fontFamily: COND, fontWeight: 700, fontSize: 44, letterSpacing: 3, color: th.muted }}>{describe(t.config)}</span>
          <span style={{ flexGrow: 1 }} />
          {pauseBadge}
        </div>
        <div style={{ flexGrow: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 28, fontFamily: COND, fontWeight: 800, fontSize: 72, letterSpacing: 10 }}>
            <span style={{ color: resting ? th.rest : undefined }}>{precount ? "ARRANCA EN" : v.phase.label}</span>
            {showRound && (
              <span style={{ fontWeight: 900, fontSize: 96, color: resting ? th.rest : dark ? t.color : th.fg }}>
                {v.phase.index}
                <span style={{ fontSize: 64, color: th.muted }}>/{v.phase.of}</span>
              </span>
            )}
          </div>
          <div style={{ fontFamily: COND, fontWeight: 900, fontSize: digits.length > 5 ? 420 : 600, lineHeight: 0.82, letterSpacing: -8, fontVariantNumeric: "tabular-nums", color: digitColor, marginTop: 12 }}>
            {digits}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <Segments t={t} now={now} th={th} height={36} />
          <div style={{ display: "flex", justifyContent: "space-between", fontFamily: COND, fontWeight: 700, fontSize: 44, letterSpacing: 2, color: th.muted }}>
            <span>
              TOTAL <span style={{ color: th.fg, fontVariantNumeric: "tabular-nums" }}>{fmt(Math.max(0, v.totalElapsedMs - pre), true)}</span> / {fmt(v.totalMs - pre, true)}
            </span>
            <span style={{ color: th.fg }}>{nextText(v.next)}</span>
          </div>
        </div>
      </div>
    );
  }

  if (size === "side") {
    const sd = SIDE[Math.min(3, Math.max(1, count)) as 1 | 2 | 3];
    return (
      <div style={{ ...panel, borderRadius: 0, border: "none", display: "flex", flexDirection: "column", height: "100%" }}>
        <div style={{ background: t.color, color: "#07080B", padding: sd.pad }}>
          <div style={{ fontFamily: COND, fontWeight: 900, fontSize: sd.name, lineHeight: 1 }}>{t.name}</div>
          <div style={{ fontFamily: COND, fontWeight: 700, fontSize: sd.mode, letterSpacing: 2 }}>{describe(t.config)}</div>
        </div>
        <div style={{ flexGrow: 1, minHeight: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: sd.gap, padding: "0 24px" }}>
          <span style={{ fontFamily: COND, fontWeight: 800, fontSize: sd.label, letterSpacing: 6, color: resting ? th.rest : th.muted }}>
            {precount ? "ARRANCA EN" : v.phase.label}
            {showRound ? ` ${v.phase.index}/${v.phase.of}` : ""}
            {paused ? " · PAUSA" : ""}
          </span>
          <span style={{ fontFamily: COND, fontWeight: 900, fontSize: digits.length > 5 ? sd.digits * 0.68 : sd.digits, lineHeight: 0.85, letterSpacing: -4, fontVariantNumeric: "tabular-nums", color: digitColor }}>{digits}</span>
          <div style={{ width: "100%", marginTop: sd.gap }}>
            <Segments t={t} now={now} th={th} height={sd.bar} />
          </div>
        </div>
        <div style={{ padding: "0 28px 12px", fontFamily: COND, fontWeight: 700, fontSize: sd.next, letterSpacing: 3, color: th.muted }}>{nextText(v.next)}</div>
      </div>
    );
  }

  const z = Z[size];
  const end = flip ? "flex-end" : "flex-start";
  return (
    <div style={{ ...panel, display: "flex", flexDirection: flip ? "row-reverse" : "row", alignItems: "center", gap: 48, padding: flip ? z.padFlip : z.pad }}>
      <div style={{ position: "absolute", top: 0, bottom: 0, width: 12, background: accent, ...(flip ? { right: 0 } : { left: 0 }) }} />
      <div style={{ flex: `0 0 ${z.left}px`, display: "flex", flexDirection: "column", gap: z.gap, textAlign: flip ? "right" : "left" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: end, gap: 8 }}>
          <span style={{ ...chip, fontSize: z.chip }}>{t.name}</span>
          <span style={{ fontFamily: COND, fontWeight: 700, fontSize: z.mode, letterSpacing: 2, color: th.muted }}>{describe(t.config)}</span>
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 16, justifyContent: end }}>
          <span style={{ fontFamily: COND, fontWeight: 800, fontSize: z.label, letterSpacing: 6, color: resting ? th.rest : undefined }}>{precount ? "ARRANCA EN" : v.phase.label}</span>
          {showRound && (
            <span style={{ fontFamily: COND, fontWeight: 900, fontSize: z.round, lineHeight: 1, color: resting ? th.rest : dark ? t.color : th.fg }}>
              {v.phase.index}
              <span style={{ fontSize: z.roundOf, color: th.muted }}>/{v.phase.of}</span>
            </span>
          )}
          {paused && <span className="pulse-pause" style={{ fontFamily: COND, fontWeight: 800, fontSize: z.label * 0.8, letterSpacing: 4, color: th.muted }}>EN PAUSA</span>}
        </div>
        <Segments t={t} now={now} th={th} height={z.seg} />
        <span style={{ fontFamily: COND, fontWeight: 700, fontSize: z.next, letterSpacing: 3, color: th.muted }}>{nextText(v.next)}</span>
      </div>
      <div style={{ flex: "1 1 0", minWidth: 0, display: "flex", justifyContent: flip ? "flex-start" : "flex-end", alignItems: "center" }}>
        <span style={{ fontFamily: COND, fontWeight: 900, fontSize: digits.length > 5 ? z.digits * 0.72 : z.digits, lineHeight: 0.86, letterSpacing: -6, fontVariantNumeric: "tabular-nums", color: digitColor }}>{digits}</span>
      </div>
    </div>
  );
}
