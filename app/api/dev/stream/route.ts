import { isValidId, transport } from "@/lib/server/keys";
import { subscribe } from "@/lib/server/devbus";

// SSE de desarrollo: la tele escucha acá cuando no hay Ably configurado.
export async function GET(request: Request) {
  if (transport() !== "dev") return Response.json({ error: "No disponible" }, { status: 404 });
  const id = new URL(request.url).searchParams.get("id");
  if (!isValidId(id)) return Response.json({ error: "Sesión inválida" }, { status: 400 });

  const enc = new TextEncoder();
  let off: (() => void) | undefined;
  let ping: ReturnType<typeof setInterval> | undefined;
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(enc.encode(": hola\n\n"));
      off = subscribe(id, (data) => controller.enqueue(enc.encode(`data: ${data}\n\n`)));
      ping = setInterval(() => controller.enqueue(enc.encode(": ping\n\n")), 15_000);
      request.signal.addEventListener("abort", () => {
        off?.();
        clearInterval(ping);
        try {
          controller.close();
        } catch {}
      });
    },
    cancel() {
      off?.();
      clearInterval(ping);
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-store, no-transform", Connection: "keep-alive" },
  });
}
