import test from "node:test";
import assert from "node:assert/strict";
import { RateLimiter } from "./rate-limit.ts";

const MIN = 60_000;

test("deja pasar hasta el límite y después frena con el tiempo de espera", () => {
  const l = new RateLimiter();
  for (let i = 1; i <= 3; i++) assert.equal(l.hit("ip", 3, MIN, 1000).ok, true, `pedido ${i}`);
  const r = l.hit("ip", 3, MIN, 1000);
  assert.equal(r.ok, false);
  assert.equal(r.retryAfterSec, 60);
  assert.equal(l.hit("ip", 3, MIN, 31_000).retryAfterSec, 30); // la espera baja con el reloj
});

test("la ventana se renueva y cada clave cuenta por separado", () => {
  const l = new RateLimiter();
  for (let i = 0; i < 4; i++) l.hit("a", 3, MIN, 0);
  assert.equal(l.hit("a", 3, MIN, 10_000).ok, false);
  assert.equal(l.hit("b", 3, MIN, 10_000).ok, true); // otra IP no se ve afectada
  assert.equal(l.hit("a", 3, MIN, MIN + 1).ok, true); // pasó la ventana
});

test("blocked() no cuenta: sirve para limitar sólo los intentos fallidos de login", () => {
  const l = new RateLimiter();
  assert.equal(l.blocked("login", 3, 0).ok, true);
  assert.equal(l.blocked("login", 3, 0).ok, true); // mirar no suma
  l.hit("login", 3, 15 * MIN, 0); // fallo 1
  l.hit("login", 3, 15 * MIN, 0); // fallo 2
  assert.equal(l.blocked("login", 3, 0).ok, true);
  l.hit("login", 3, 15 * MIN, 0); // fallo 3: se alcanzó el límite
  const b = l.blocked("login", 3, 1000);
  assert.equal(b.ok, false);
  assert.equal(b.retryAfterSec, 899);
  assert.equal(l.blocked("login", 3, 15 * MIN + 1).ok, true); // vence la ventana
});

test("un login correcto limpia el contador", () => {
  const l = new RateLimiter();
  l.hit("login", 3, 15 * MIN, 0);
  l.hit("login", 3, 15 * MIN, 0);
  l.reset("login");
  assert.equal(l.blocked("login", 3, 0).ok, true);
  assert.equal(l.hit("login", 3, 15 * MIN, 0).ok, true);
});

test("la memoria no crece sin límite", () => {
  const l = new RateLimiter(100);
  for (let i = 0; i < 1000; i++) l.hit(`ip${i}`, 5, MIN, i);
  assert.ok(l.size <= 100, `quedaron ${l.size} claves`);
  // las ventanas vencidas se descartan primero
  const m = new RateLimiter(10);
  for (let i = 0; i < 10; i++) m.hit(`viejo${i}`, 5, 1000, 0);
  m.hit("nuevo", 5, 1000, 5000);
  assert.ok(m.size <= 10);
  assert.equal(m.blocked("nuevo", 1, 5000).ok, false);
});
