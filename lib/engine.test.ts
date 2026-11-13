import test from "node:test";
import assert from "node:assert/strict";
import { buildPhases, viewAt, fmt, totalSec } from "./engine.ts";
import {
  newTimer,
  startTimer,
  pauseTimer,
  resetTimer,
  nudgeTimer,
  skipPhase,
  statusOf,
  tvLayout,
  emptyState,
  elapsedOf,
  type TimerState,
} from "./state.ts";

const S = 1000;

test("regresiva 15:00 cuenta hacia abajo y termina", () => {
  const p = buildPhases({ kind: "regresiva", totalSec: 900 }, false);
  assert.equal(totalSec(p), 900);
  assert.equal(fmt(viewAt(p, 0).displayMs), "15:00");
  assert.equal(fmt(viewAt(p, 1 * S).displayMs), "14:59");
  assert.equal(fmt(viewAt(p, 899 * S + 500).displayMs), "00:01");
  const end = viewAt(p, 900 * S);
  assert.equal(end.finished, true);
  assert.equal(fmt(end.displayMs), "00:00");
  assert.equal(viewAt(p, 905 * S).finishedForMs, 5 * S);
});

test("amrap 3 bloques: intercala descansos y marca bloque N/3", () => {
  const p = buildPhases({ kind: "amrap", blockSec: 300, blocks: 3, restSec: 60 }, false);
  assert.equal(p.length, 5); // 3 bloques + 2 descansos
  assert.equal(totalSec(p), 3 * 300 + 2 * 60);
  const v = viewAt(p, (300 + 60 + 100) * S); // 100 s dentro del bloque 2
  assert.equal(v.phase.label, "BLOQUE");
  assert.equal(v.phase.index, 2);
  assert.equal(v.phase.of, 3);
  assert.equal(fmt(v.displayMs), "03:20");
  assert.equal(v.next?.type, "rest");
  const rest = viewAt(p, (300 + 10) * S);
  assert.equal(rest.phase.type, "rest");
  assert.equal(fmt(rest.displayMs), "00:50");
});

test("emom 12 x 1:00: cada minuto reinicia en 1:00", () => {
  const p = buildPhases({ kind: "emom", everySec: 60, rounds: 12 }, false);
  const v = viewAt(p, (6 * 60 + 22) * S);
  assert.equal(v.phase.index, 7);
  assert.equal(v.phase.of, 12);
  assert.equal(fmt(v.displayMs), "00:38");
  assert.equal(viewAt(p, 12 * 60 * S).finished, true);
});

test("tabata 8 x 20/10 alterna trabajo y descanso", () => {
  const p = buildPhases({ kind: "tabata", workSec: 20, restSec: 10, rounds: 8 }, false);
  assert.equal(totalSec(p), 240);
  assert.equal(viewAt(p, 5 * S).phase.type, "work");
  assert.equal(viewAt(p, 25 * S).phase.type, "rest");
  assert.equal(viewAt(p, 30 * S).phase.index, 2);
});

test("for time cuenta hacia arriba hasta el cap", () => {
  const p = buildPhases({ kind: "fortime", capSec: 720 }, false);
  assert.equal(fmt(viewAt(p, 0).displayMs, true), "00:00");
  assert.equal(fmt(viewAt(p, 65 * S + 900).displayMs, true), "01:05");
  assert.equal(viewAt(p, 720 * S).finished, true);
});

test("cuenta previa de 10 s va antes de todo", () => {
  const p = buildPhases({ kind: "regresiva", totalSec: 60 }, true);
  assert.equal(p[0].type, "precount");
  const v = viewAt(p, 3 * S);
  assert.equal(v.phase.type, "precount");
  assert.equal(fmt(v.displayMs), "00:07");
  assert.equal(viewAt(p, 10 * S).phase.type, "work");
  assert.equal(fmt(viewAt(p, 10 * S).displayMs), "01:00");
});

test("formato pasa a h:mm:ss", () => {
  assert.equal(fmt(3725 * S), "1:02:05");
});

const base = (): TimerState => ({ ...newTimer(0), config: { kind: "regresiva", totalSec: 60 }, precount: false });

test("largar, pausar y reanudar conservan el tiempo", () => {
  let t = base();
  assert.equal(statusOf(t, 0), "ready");
  t = startTimer(t, 1000);
  assert.equal(statusOf(t, 1000), "running");
  assert.equal(t.onTv, true);
  assert.equal(elapsedOf(t, 11_000), 10_000);
  t = pauseTimer(t, 11_000);
  assert.equal(statusOf(t, 99_000), "paused");
  assert.equal(elapsedOf(t, 99_000), 10_000);
  t = startTimer(t, 100_000);
  assert.equal(elapsedOf(t, 105_000), 15_000);
});

test("a cero deja la config y vuelve a ready", () => {
  let t = startTimer(base(), 0);
  t = resetTimer(pauseTimer(t, 30_000));
  assert.equal(statusOf(t, 40_000), "ready");
  assert.equal(t.config.kind, "regresiva");
  assert.equal(t.name, "CROSSFIT");
});

test("largar un timer terminado lo reinicia desde cero", () => {
  let t = startTimer(base(), 0);
  assert.equal(statusOf(t, 70_000), "finished");
  t = startTimer(t, 80_000);
  assert.equal(statusOf(t, 80_000), "running");
  assert.equal(elapsedOf(t, 85_000), 5_000);
});

test("±10 s y saltar fase", () => {
  let t = startTimer(base(), 0);
  t = nudgeTimer(t, 5_000, -10_000); // no baja de 0
  assert.equal(elapsedOf(t, 5_000), 0);
  t = nudgeTimer(t, 5_000, 10_000);
  assert.equal(elapsedOf(t, 8_000), 13_000);
  const a = { ...base(), config: { kind: "amrap", blockSec: 300, blocks: 3, restSec: 60 } as const };
  const s = skipPhase(startTimer(a, 0), 100_000);
  assert.equal(elapsedOf(s, 100_000), 300_000);
});

test("tele: FIN visible 10 s y después vuelve la plani", () => {
  const t = startTimer(base(), 0);
  const s = { ...emptyState(), view: "timers" as const, timers: [t] };
  assert.equal(tvLayout(s, 30_000).mode, "timers");
  assert.equal(tvLayout(s, 65_000).timers.length, 1); // FIN, 5 s después
  assert.equal(tvLayout(s, 71_000).mode, "plani"); // 11 s después
});

test("tele: sólo muestra los marcados en la tele", () => {
  const a = startTimer(base(), 0);
  const b = { ...newTimer(1), onTv: false };
  const s = { ...emptyState(), view: "timers" as const, timers: [a, b] };
  assert.equal(tvLayout(s, 1000).timers.length, 1);
  assert.equal(tvLayout({ ...s, view: "plani" }, 1000).mode, "plani");
});
