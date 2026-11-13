// Credenciales de sesión y "quién tiene el control". Funciones puras (sin React ni red).

export type Creds = { id: string; ctl: string };

const HASH_RE = /^#?([a-z0-9-]{8,48})\.([A-Za-z0-9_-]{10,40})$/;

/** Lee `#<id>.<llave>` (el hash del QR o del link fijo de la tele). */
export function parseSessionHash(hash: string): Creds | null {
  const m = HASH_RE.exec(hash);
  return m ? { id: m[1], ctl: m[2] } : null;
}

/** Pega-todo: acepta el link completo (`https://…/c#id.llave`) o sólo `id.llave`. */
export function findSessionIn(text: string): Creds | null {
  const t = text.trim();
  const i = t.lastIndexOf("#");
  return parseSessionHash(i >= 0 ? t.slice(i) : t);
}

/** Nombre de sesión legible para el id: minúsculas y números, hasta 16 caracteres ("Sala 1" → "sala1"). */
export function slugify(name: string | null | undefined): string {
  return (name ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 16);
}

/** El nombre viaja dentro del id: `sala1-<12 hex>`. Sin nombre, sólo los 12 hex. */
export const makeSessionId = (slug: string, rand: string): string => (slug ? `${slug}-${rand}` : rand);

/** El nombre de una sesión ("sala1") o "" si no tiene. */
export function sessionLabel(id: string): string {
  const i = id.lastIndexOf("-");
  return i > 0 ? id.slice(0, i) : "";
}

/** Dónde la tele guarda su nombre (sobrevive a los reinicios de sesión). */
export const TV_NAME_KEY = "wod:tv:name";

/** Nombre para mostrar: sin espacios de más ni caracteres de control, hasta 40 caracteres. */
export function cleanName(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 40);
}

export const sessionHash = (c: Creds): string => `#${c.id}.${c.ctl}`;

export type Control = "free" | "me" | "other";

/** ¿Quién manda en la tele? Un solo celular a la vez: el último que escaneó el QR. */
export function controlOf(s: { controller?: string | null }, me: string): Control {
  if (!s.controller) return "free";
  return s.controller === me ? "me" : "other";
}
