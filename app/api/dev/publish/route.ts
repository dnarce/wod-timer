import { checkControlKey, isValidId, transport } from "@/lib/server/keys";
import { publish } from "@/lib/server/devbus";

export async function POST(request: Request) {
  if (transport() !== "dev") return Response.json({ error: "No disponible" }, { status: 404 });
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!isValidId(id) || !checkControlKey(id, searchParams.get("ctl"))) {
    return Response.json({ error: "Llave inválida" }, { status: 403 });
  }
  const body = await request.text();
  if (body.length > 64_000) return Response.json({ error: "Muy grande" }, { status: 413 });
  publish(id, body);
  return Response.json({ ok: true });
}
