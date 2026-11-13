import { controlKey, newSessionId } from "@/lib/server/keys";
import { rateLimit } from "@/lib/server/limits";

// La tele pide una sesión nueva (sin `PANTALLAS`, o al reiniciar una sesión cerrada) y guarda el resultado.
// El `ctl` sólo viaja en el QR. `?nombre=Sala 1` le pone nombre a la sesión (lo ve /sesiones).
export async function POST(request: Request) {
  const limited = rateLimit(request, "session");
  if (limited) return limited;
  const nombre = new URL(request.url).searchParams.get("nombre");
  const id = newSessionId(nombre);
  return Response.json({ id, ctl: controlKey(id) }, { headers: { "Cache-Control": "no-store" } });
}
