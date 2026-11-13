import { connection } from "next/server";
import { transport } from "@/lib/server/keys";

// Hora del servidor para que celular y tele compartan reloj, y qué transporte usar.
export async function GET() {
  await connection();
  return Response.json({ now: Date.now(), transport: transport() }, { headers: { "Cache-Control": "no-store" } });
}
