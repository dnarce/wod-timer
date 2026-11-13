// Pedidos REST a Ably con la API key (sólo desde el servidor).
const BASE = "https://main.realtime.ably.net";

function headers(extra: Record<string, string> = {}): Record<string, string> {
  const key = process.env.ABLY_API_KEY;
  if (!key) throw new Error("Falta ABLY_API_KEY");
  return {
    Authorization: "Basic " + Buffer.from(key).toString("base64"),
    // Si el canal exige "Identification required", Ably pide un clientId también en pedidos REST (en base64).
    "X-Ably-ClientId": Buffer.from("admin").toString("base64"),
    ...extra,
  };
}

export type ActiveSession = { id: string; connections: number; publishers: number; subscribers: number };

type ChannelInfo = {
  channelId?: string;
  name?: string;
  status?: { occupancy?: { metrics?: { connections?: number; publishers?: number; subscribers?: number } } };
};

/** Sesiones con alguien conectado ahora. Ably sólo lista canales *activos*: una tele apagada no aparece. */
export async function listSessions(): Promise<ActiveSession[]> {
  const r = await fetch(`${BASE}/channels?prefix=${encodeURIComponent("wod:")}&by=value&limit=100`, {
    headers: headers(),
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`Ably ${r.status}`);
  const items = (await r.json()) as ChannelInfo[];
  return items.flatMap((c) => {
    const name = c.channelId ?? c.name ?? "";
    if (!name.startsWith("wod:")) return [];
    const m = c.status?.occupancy?.metrics ?? {};
    return [{ id: name.slice(4), connections: m.connections ?? 0, publishers: m.publishers ?? 0, subscribers: m.subscribers ?? 0 }];
  });
}

/** Publica un mensaje en el canal de una sesión. Con el evento "state" reemplaza el último mensaje guardado. */
export async function publishEvent(id: string, event: string, data: unknown): Promise<void> {
  const r = await fetch(`${BASE}/channels/${encodeURIComponent(`wod:${id}`)}/messages`, {
    method: "POST",
    headers: headers({ "Content-Type": "application/json" }),
    body: JSON.stringify({ name: event, data: JSON.stringify(data), encoding: "json" }),
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`Ably ${r.status}`);
}

export const publishState = (id: string, state: unknown) => publishEvent(id, "state", state);

export type PresenceMember = { clientId: string; data: Record<string, unknown> };

/** Quién está anunciándose en el canal (la tele anuncia `{ role: "tv", name }`). */
export async function getPresence(id: string): Promise<PresenceMember[]> {
  const r = await fetch(`${BASE}/channels/${encodeURIComponent(`wod:${id}`)}/presence`, { headers: headers(), cache: "no-store" });
  if (!r.ok) throw new Error(`Ably ${r.status}`);
  const items = (await r.json()) as { clientId?: string; data?: unknown }[];
  return items.map((m) => {
    let data = m.data;
    if (typeof data === "string") {
      try {
        data = JSON.parse(data);
      } catch {}
    }
    return { clientId: m.clientId ?? "", data: data && typeof data === "object" ? (data as Record<string, unknown>) : {} };
  });
}
