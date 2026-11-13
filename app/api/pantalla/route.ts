import { controlKey } from "@/lib/server/keys";
import { rateLimit } from "@/lib/server/limits";
import { parseScreens, screenId, screenLabel } from "@/lib/screens";

// La tele de una pantalla fija (`/carrodilla`) pide su sesión: siempre el mismo id y la misma llave.
// Sólo responde para los nombres listados en la variable PANTALLAS.
export async function GET(request: Request) {
  const limited = rateLimit(request, "screen");
  if (limited) return limited;
  const screens = parseScreens(process.env.PANTALLAS);
  const nombre = new URL(request.url).searchParams.get("nombre");
  // Sin nombre: sólo dice si hay pantallas configuradas (la tele suelta de `/` ya no crea sesiones).
  if (nombre === null) return Response.json({ configured: screens.length > 0 }, { headers: { "Cache-Control": "no-store" } });
  if (!screens.includes(nombre.toLowerCase())) {
    return Response.json({ error: "not-found" }, { status: 404, headers: { "Cache-Control": "no-store" } });
  }
  const slug = nombre.toLowerCase();
  const id = screenId(slug);
  return Response.json({ id, ctl: controlKey(id), name: screenLabel(slug) }, { headers: { "Cache-Control": "no-store" } });
}
