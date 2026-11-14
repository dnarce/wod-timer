import test from "node:test";
import assert from "node:assert/strict";
import { soundEvents } from "./soundEvents.ts";
import { newTimer, startTimer } from "./state.ts";

const run = (config: object, precount: boolean, at = 0, now = 0) =>
  soundEvents([startTimer({ ...newTimer(0), precount, config: config as never }, at)], now);

test("amrap 2 bloques de 10 s con descanso de 10 s: el sonido arranca 3 s antes de cada cambio y del final", () => {
  const ev = run({ kind: "amrap", blockSec: 10, blocks: 2, restSec: 10 }, false);
  assert.deepEqual(ev.map((e) => e.atMs / 1000), [7, 17, 27]);
  assert.ok(ev.every((e) => e.skipSec === 0));
});

test("con precuenta de 10 s suena antes de largar y antes de cada tramo", () => {
  const ev = run({ kind: "regresiva", totalSec: 5 }, true);
  assert.deepEqual(ev.map((e) => [e.atMs / 1000, e.skipSec]), [[7, 0], [12, 0]]);
});

test("un tramo de menos de 3 s entra al sonido ya empezado, para que el beep largo caiga en el cambio", () => {
  const ev = run({ kind: "regresiva", totalSec: 2 }, false);
  assert.deepEqual(ev.map((e) => [e.atMs / 1000, e.skipSec]), [[0, 1]]);
});

test("si ya se está dentro de la cuenta, el sonido entra por donde corresponde", () => {
  // Largó en 0; ahora son 8,5 s de un tramo de 10 s: faltan 1,5 s, o sea 1,5 s adentro del sonido.
  const ev = run({ kind: "regresiva", totalSec: 10 }, false, 0, 8500);
  assert.deepEqual(ev.map((e) => [e.atMs, e.skipSec]), [[0, 1.5]]);
});

test("cronómetro hacia arriba: sólo suena el beep largo al final", () => {
  const ev = run({ kind: "fortime", capSec: 60 }, false);
  assert.deepEqual(ev.map((e) => [e.atMs / 1000, e.skipSec]), [[60, 3]]);
});

test("un timer silenciado no genera sonidos y los demás siguen", () => {
  const mk = (i: number, muted: boolean) => startTimer({ ...newTimer(i), muted, precount: false, config: { kind: "regresiva" as const, totalSec: 10 } }, 0);
  assert.equal(soundEvents([mk(0, true)], 0).length, 0);
  assert.equal(soundEvents([mk(0, true), mk(1, false)], 0).length, 1);
});

test("de entrada sólo suena el primer timer", () => {
  assert.equal(newTimer(0).muted, false);
  assert.equal(newTimer(1).muted, true);
  assert.equal(newTimer(2).muted, true);
});
