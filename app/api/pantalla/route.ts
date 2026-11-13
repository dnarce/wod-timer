import { controlKey } from "@/lib/server/keys";
import { rateLimit } from "@/lib/server/limits";
import { parseScreens, screenId, screenLabel } from "@/lib/screens";

// La tele de una pantalla fija (`/carrodilla`) pide su sesión: siempre el mismo id y la misma llave.
// Sólo responde para los nombres listados en la variable PANTALLAS.
export async function GET(request: Request) {
  const limited = rateLimit(request, "screen");
  if (limited) return limited;
  const nombre = (new URL(request.url).searchParams.get("nombre") ?? "").toLowerCase();
  if (!parseScreens(process.env.PANTALLAS).includes(nombre)) {
    return Response.json({ error: "not-found" }, { status: 404, headers: { "Cache-Control": "no-store" } });
  }
  const id = screenId(nombre);
  return Response.json({ id, ctl: controlKey(id), name: screenLabel(nombre) }, { headers: { "Cache-Control": "no-store" } });
}
