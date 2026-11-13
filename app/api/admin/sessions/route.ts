import { requireAdmin } from "@/lib/server/admin";
import { getPresence, listSessions } from "@/lib/server/ably-rest";
import { controlKey } from "@/lib/server/keys";
import { cleanName, sessionHash, sessionLabel } from "@/lib/session";

// Sesiones activas (con alguien conectado). Incluye el link de control: por eso sólo lo ve el administrador.
export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;
  try {
    const list = await listSessions();
    // Ably sigue listando un rato un canal después de que se va el último conectado: sin nadie, no hay nada que manejar.
    const active = list.filter((s) => s.connections > 0);
    // El nombre lo anuncia la tele por presencia. Si no se puede leer, se cae al nombre corto del id.
    const names = await Promise.all(
      active.map(async (s) => {
        try {
          const tv = (await getPresence(s.id)).find((m) => m.data.role === "tv");
          return cleanName(tv?.data.name);
        } catch {
          return "";
        }
      }),
    );
    const sessions = active
      .map((s, i) => ({
        id: s.id,
        name: names[i],
        label: sessionLabel(s.id),
        connections: s.connections,
        phones: s.publishers, // conexiones que publican = celulares
        tvs: Math.max(0, s.connections - s.publishers),
        controlPath: `/c${sessionHash({ id: s.id, ctl: controlKey(s.id) })}`,
      }))
      .sort((a, b) => b.connections - a.connections || a.id.localeCompare(b.id));
    return Response.json({ sessions }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    // Ably permite una sola enumeración a la vez: si dos administradores consultan juntos, uno reintenta.
    return Response.json({ error: "ably" }, { status: 502 });
  }
}
