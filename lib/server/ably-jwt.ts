import { createHmac } from "node:crypto";

// Firma un JWT de Ably (HS256) con la API key. No hace falta el SDK de servidor:
// el navegador sólo recibe este token, nunca la clave.
export function createAblyJwt(opts: {
  apiKey: string; // "keyName:keySecret"
  capability: Record<string, string[]>;
  clientId: string;
  ttlSec?: number;
}): string {
  const [keyName, keySecret] = opts.apiKey.split(":");
  if (!keyName || !keySecret) throw new Error("ABLY_API_KEY con formato inválido (esperaba nombre:secreto)");
  const now = Math.floor(Date.now() / 1000);
  const b64 = (v: unknown) => Buffer.from(JSON.stringify(v)).toString("base64url");
  const header = { typ: "JWT", alg: "HS256", kid: keyName };
  const claims = {
    iat: now,
    exp: now + (opts.ttlSec ?? 3600),
    "x-ably-capability": JSON.stringify(opts.capability),
    "x-ably-clientId": opts.clientId,
  };
  const input = `${b64(header)}.${b64(claims)}`;
  const sig = createHmac("sha256", keySecret).update(input).digest("base64url");
  return `${input}.${sig}`;
}
