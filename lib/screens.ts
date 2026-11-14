// Pantallas fijas: la variable de entorno PANTALLAS (`carrodilla,godoy_cruz-clase`) lista las teles con link permanente
// (`/carrodilla`). Funciones puras: sin React ni red.

const SLUG_RE = /^[a-z0-9][a-z0-9_-]{0,39}$/;

/** Nombres válidos de la variable (separados por coma, sin repetidos ni inválidos). */
export function parseScreens(raw: string | undefined | null): string[] {
  const out: string[] = [];
  for (const part of (raw ?? "").split(",")) {
    const s = part.trim().toLowerCase();
    if (SLUG_RE.test(s) && !out.includes(s)) out.push(s);
  }
  return out;
}

/** El id interno de la sesión (y su canal `wod:<id>` en Ably). Lleva prefijo para no mezclarse con las sesiones al azar. */
export const SCREEN_PREFIX = "pantalla-";
export const screenId = (slug: string): string => `${SCREEN_PREFIX}${slug}`;

/** Nombre para mostrar en /sesiones ("godoy_cruz-clase" → "godoy cruz clase"). */
export const screenLabel = (slug: string): string => slug.replace(/[_-]+/g, " ");
