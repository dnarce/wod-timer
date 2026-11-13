import test from "node:test";
import assert from "node:assert/strict";
import { parseScreens, screenId, screenLabel } from "./screens.ts";
import { parseSessionHash } from "./session.ts";

test("lee la lista de pantallas", () => {
  assert.deepEqual(parseScreens("carrodilla,godoy_cruz-open_box, Godoy_Cruz-Clase "), ["carrodilla", "godoy_cruz-open_box", "godoy_cruz-clase"]);
  assert.deepEqual(parseScreens("a,,a,mal nombre,../x,ñandu"), ["a"]);
  assert.deepEqual(parseScreens(undefined), []);
});

test("el id interno lleva prefijo y es un id válido", () => {
  assert.equal(screenId("carrodilla"), "pantalla-carrodilla");
  assert.ok(parseSessionHash(`#${screenId("godoy_cruz-clase")}.U5hQmNOImUfuW_221mBz1P`));
  assert.equal(screenLabel("godoy_cruz-clase"), "godoy cruz clase");
});
