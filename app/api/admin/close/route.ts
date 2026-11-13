import { requireAdmin } from "@/lib/server/admin";
import { publishState } from "@/lib/server/ably-rest";
import { isValidId } from "@/lib/server/keys";
import type { SessionState } from "@/lib/state";

// Cierra una sesión: publica un estado "cerrado". La tele pide una sesión nueva y los celulares se despiden.
// (Ably no permite borrar canales ni su último mensaje: se pisa con este.)
export async function POST(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const body = (await request.json().catch(() => null)) as { id?: unknown } | null;
  const id = typeof body?.id === "string" ? body.id : null;
  if (!isValidId(id)) return Response.json({ error: "bad-id" }, { status: 400 });
  const closed: SessionState = { rev: Date.now(), controller: null, closed: true, view: "plani", theme: "noche", timers: [] };
  try {
    await publishState(id, closed);
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "ably" }, { status: 502 });
  }
}
