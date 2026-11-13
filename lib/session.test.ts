import test from "node:test";
import assert from "node:assert/strict";
import { cleanName, controlOf, findSessionIn, makeSessionId, parseSessionHash, sessionHash, sessionLabel, slugify } from "./session.ts";
import { emptyState } from "./state.ts";

test("lee el hash del QR y lo vuelve a armar igual", () => {
  const c = parseSessionHash("#a8901411c745.U5hQmNOImUfuW_221mBz1P");
  assert.deepEqual(c, { id: "a8901411c745", ctl: "U5hQmNOImUfuW_221mBz1P" });
  assert.equal(sessionHash(c!), "#a8901411c745.U5hQmNOImUfuW_221mBz1P");
  assert.deepEqual(parseSessionHash("a8901411c745.U5hQmNOImUfuW_221mBz1P"), c); // sin '#'
});

test("rechaza hashes inválidos", () => {
  for (const bad of ["", "#", "#abc.def", "#A8901411C745.U5hQmNOImUfuW_221mBz1P", "#a8901411c745", "#a8901411c745.corta", "#a8901411c745.llave con espacios....", "#a8901411c745.U5hQmNOImUfuW_221mBz1P.extra"]) {
    assert.equal(parseSessionHash(bad), null, bad);
  }
});

test("quién tiene el control", () => {
  assert.equal(controlOf(emptyState(), "yo"), "free");
  assert.equal(controlOf({ controller: undefined }, "yo"), "free"); // estados viejos sin el campo
  assert.equal(controlOf({ controller: "yo" }, "yo"), "me");
  assert.equal(controlOf({ controller: "otro" }, "yo"), "other");
});

test("el nombre viaja dentro del id", () => {
  assert.equal(slugify("Sala 1"), "sala1");
  assert.equal(slugify("  Sede Centro – Planta Baja "), "sedecentroplanta"); // 16 caracteres como máximo
  assert.equal(slugify("Ñandú Gym"), "nandugym");
  assert.equal(slugify(null), "");
  const id = makeSessionId("sala1", "a8901411c745");
  assert.equal(id, "sala1-a8901411c745");
  assert.equal(sessionLabel(id), "sala1");
  assert.equal(sessionLabel("a8901411c745"), "");
  // un id con nombre también es un hash válido
  assert.deepEqual(parseSessionHash("#sala1-a8901411c745.U5hQmNOImUfuW_221mBz1P"), { id, ctl: "U5hQmNOImUfuW_221mBz1P" });
});

test("pegar un link o sólo id.llave", () => {
  const want = { id: "a8901411c745", ctl: "U5hQmNOImUfuW_221mBz1P" };
  assert.deepEqual(findSessionIn("https://wod.vercel.app/c#a8901411c745.U5hQmNOImUfuW_221mBz1P"), want);
  assert.deepEqual(findSessionIn("  http://192.168.2.234:3000/c#a8901411c745.U5hQmNOImUfuW_221mBz1P \n"), want);
  assert.deepEqual(findSessionIn("a8901411c745.U5hQmNOImUfuW_221mBz1P"), want);
  assert.equal(findSessionIn("https://wod.vercel.app/c"), null);
  assert.equal(findSessionIn("hola"), null);
});

test("nombre para mostrar", () => {
  assert.equal(cleanName("  Sala   Principal  "), "Sala Principal");
  assert.equal(cleanName("Sede Centro\n\t– Planta"), "Sede Centro – Planta");
  assert.equal(cleanName("x".repeat(100)).length, 40);
  assert.equal(cleanName(""), "");
  assert.equal(cleanName(null), "");
  assert.equal(cleanName(42), "");
});
