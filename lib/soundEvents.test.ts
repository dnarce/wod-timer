import test from "node:test";
import assert from "node:assert/strict";
import { soundEvents } from "./soundEvents.ts";
import { newTimer, startTimer } from "./state.ts";

test("amrap 2 bloques de 10 s con descanso de 10 s: 5 ticks y largada al final de cada tramo, y el final", () => {
  let t = newTimer(0);
  t = { ...t, precount: false, config: { kind: "amrap", blockSec: 10, blocks: 2, restSec: 10 } };
  t = startTimer(t, 0);
  const ev = soundEvents([t], 0);
  const sec = (k: string) => ev.filter((e) => e.kind === k).map((e) => e.atMs / 1000);
  assert.deepEqual(sec("tick"), [5, 6, 7, 8, 9, 15, 16, 17, 18, 19, 25, 26, 27, 28, 29]);
  assert.deepEqual(sec("go"), [10, 20]);
  assert.deepEqual(sec("end"), [30]);
});

test("tramo de 5 s: sin tick en el segundo 0, y la cuenta previa también cuenta", () => {
  let t = newTimer(0);
  t = { ...t, precount: true, config: { kind: "regresiva", totalSec: 5 } };
  t = startTimer(t, 0);
  const ev = soundEvents([t], 0);
  assert.deepEqual(ev.filter((e) => e.kind === "tick").map((e) => e.atMs / 1000), [5, 6, 7, 8, 9, 11, 12, 13, 14]);
});

test("cada timer suena con su altura: el 2.º es más agudo que el 1.º", () => {
  const mk = (i: number) => startTimer({ ...newTimer(i), muted: false, precount: false, config: { kind: "regresiva" as const, totalSec: 10 } }, 0);
  const ev = soundEvents([mk(0), mk(1)], 0);
  const rates = new Set(ev.map((e) => e.rate));
  assert.deepEqual([...rates].sort(), [1, 1.26]);
});

test("un timer silenciado no genera sonidos y los demás siguen", () => {
  const mk = (i: number, muted: boolean) => startTimer({ ...newTimer(i), muted, precount: false, config: { kind: "regresiva" as const, totalSec: 10 } }, 0);
  const ev = soundEvents([mk(0, true), mk(1, false)], 0);
  assert.ok(ev.length > 0 && ev.every((e) => e.rate === 1.26));
});

test("de entrada sólo suena el primer timer", () => {
  assert.equal(newTimer(0).muted, false);
  assert.equal(newTimer(1).muted, true);
  assert.equal(newTimer(2).muted, true);
});
