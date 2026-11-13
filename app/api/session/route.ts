import { controlKey, newSessionId } from "@/lib/server/keys";

// La tele pide una sesión nueva (una sola vez, o al abrir /new) y guarda el resultado.
// El `ctl` sólo viaja en el QR. `?nombre=Sala 1` le pone nombre a la sesión (lo ve /sesiones).
export async function POST(request: Request) {
  const nombre = new URL(request.url).searchParams.get("nombre");
  const id = newSessionId(nombre);
  return Response.json({ id, ctl: controlKey(id) }, { headers: { "Cache-Control": "no-store" } });
}
