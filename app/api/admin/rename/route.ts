import { requireAdmin } from "@/lib/server/admin";
import { publishEvent } from "@/lib/server/ably-rest";
import { isValidId } from "@/lib/server/keys";
import { cleanName } from "@/lib/session";

// Renombra una sesión: manda la orden a su tele, que guarda el nombre y lo anuncia por presencia.
export async function POST(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const body = (await request.json().catch(() => null)) as { id?: unknown; name?: unknown } | null;
  const id = typeof body?.id === "string" ? body.id : null;
  if (!isValidId(id)) return Response.json({ error: "bad-id" }, { status: 400 });
  const name = cleanName(body?.name);
  try {
    await publishEvent(id, "rename", { name });
    return Response.json({ ok: true, name });
  } catch {
    return Response.json({ error: "ably" }, { status: 502 });
  }
}
