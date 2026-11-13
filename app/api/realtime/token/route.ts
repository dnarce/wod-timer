import { checkControlKey, isValidId } from "@/lib/server/keys";
import { createAblyJwt } from "@/lib/server/ably-jwt";

// Tele: escucha y anuncia su nombre por presencia (no publica estados). Celular con llave válida: escuchar y publicar.
// Devuelve un JWT de Ably como texto plano.
export async function GET(request: Request) {
  const key = process.env.ABLY_API_KEY;
  if (!key) return new Response("Falta ABLY_API_KEY", { status: 503 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!isValidId(id)) return new Response("Sesión inválida", { status: 400 });

  const ctl = searchParams.get("ctl");
  const canControl = ctl !== null && checkControlKey(id, ctl);
  if (ctl !== null && !canControl) return new Response("Llave inválida", { status: 403 });

  const token = createAblyJwt({
    apiKey: key,
    // Un clientId estable por sesión y rol: así Ably cuenta pocos usuarios activos (MAU), no uno por reconexión.
    clientId: `${canControl ? "phone" : "tv"}:${id}`,
    capability: { [`wod:${id}`]: canControl ? ["subscribe", "publish", "history"] : ["subscribe", "history", "presence"] },
  });
  return new Response(token, { headers: { "Content-Type": "text/plain", "Cache-Control": "no-store" } });
}
