import { requireAdmin } from "@/lib/server/admin";
import { listSessions } from "@/lib/server/ably-rest";
import { controlKey } from "@/lib/server/keys";
import { parseScreens, screenId, screenLabel } from "@/lib/screens";
import { sessionHash } from "@/lib/session";

// Las pantallas de la variable PANTALLAS con su estado (tele y celulares conectados ahora).
// Incluye el link de control: por eso sólo lo ve el administrador.
export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;
  try {
    const live = new Map((await listSessions()).map((s) => [s.id, s]));
    const screens = parseScreens(process.env.PANTALLAS).map((slug) => {
      const id = screenId(slug);
      const s = live.get(id);
      const connections = s?.connections ?? 0;
      const phones = Math.min(s?.publishers ?? 0, connections); // conexiones que publican = celulares
      return {
        id,
        name: screenLabel(slug),
        phones,
        tvs: connections - phones,
        controlPath: `/c${sessionHash({ id, ctl: controlKey(id) })}`,
      };
    });
    return Response.json({ screens }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    // Ably permite una sola enumeración a la vez: si dos administradores consultan juntos, uno reintenta.
    return Response.json({ error: "ably" }, { status: 502 });
  }
}
