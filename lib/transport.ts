"use client";
import type { SessionState } from "./state";
import { transportKind } from "./clock";

export type Link = {
  publish: (s: SessionState) => Promise<void>;
  /** Actualiza los datos que esta conexión anuncia por presencia (la tele anuncia su nombre). */
  setPresence: (data: Record<string, unknown>) => Promise<void>;
  close: () => void;
};

type Opts = {
  id: string;
  ctl: string; // llave de la sesión: la piden todos para conectarse
  role: "tv" | "control";
  onState: (s: SessionState) => void;
  onConnection: (ok: boolean) => void;
  /** Datos que se anuncian por presencia al conectar (sólo Ably). */
  presence?: Record<string, unknown>;
  /** Orden de renombrar enviada desde /sesiones. */
  onRename?: (name: string) => void;
};

const isState = (x: unknown): x is SessionState =>
  !!x && typeof x === "object" && Array.isArray((x as SessionState).timers) && typeof (x as SessionState).rev === "number";

export async function connect(o: Opts): Promise<Link> {
  return transportKind() === "ably" ? connectAbly(o) : connectDev(o);
}

async function connectAbly({ id, ctl, role, onState, onConnection, presence, onRename }: Opts): Promise<Link> {
  const { createClient } = await import("@ably/pubsub-device");
  const q = new URLSearchParams({ id, ctl, role });
  const client = createClient({
    // El navegador nunca ve la API key: pide un JWT firmado a nuestro servidor.
    authCallback: async (_params, callback) => {
      try {
        const r = await fetch(`/api/realtime/token?${q}`, { cache: "no-store" });
        if (!r.ok) throw new Error(await r.text());
        callback(null, await r.text());
      } catch (e) {
        callback(e instanceof Error ? e.message : String(e), null);
      }
    },
  });
  client.connection.on((c) => onConnection(c.current === "connected"));
  // rewind=1: al conectar recibimos el último estado publicado.
  const channel = client.channels.get(`wod:${id}`, { params: { rewind: "1" } });
  await channel.subscribe("state", (m) => {
    if (isState(m.data)) onState(m.data);
  });
  if (onRename) {
    await channel.subscribe("rename", (m) => {
      const n = (m.data as { name?: unknown } | null)?.name;
      if (typeof n === "string") onRename(n);
    });
  }
  // La presencia no es crítica: si falla (sin permiso, sin red) la app sigue funcionando.
  if (presence) channel.presence.enter(presence).catch(() => {});
  return {
    publish: async (s) => {
      await channel.publish("state", s);
    },
    setPresence: async (data) => {
      await channel.presence.update(data).catch(() => {});
    },
    close: () => client.close(),
  };
}

// Desarrollo local: SSE para escuchar + POST para publicar.
async function connectDev({ id, ctl, onState, onConnection }: Opts): Promise<Link> {
  const es = new EventSource(`/api/dev/stream?id=${id}`);
  es.onopen = () => onConnection(true);
  es.onerror = () => onConnection(false);
  es.onmessage = (e) => {
    try {
      const s: unknown = JSON.parse(e.data);
      if (isState(s)) onState(s);
    } catch {}
  };
  return {
    publish: async (s) => {
      await fetch(`/api/dev/publish?id=${id}&ctl=${ctl}`, { method: "POST", body: JSON.stringify(s) });
    },
    setPresence: async () => {},
    close: () => es.close(),
  };
}

// Persistencia local para que un reinicio de tele/celular no pierda los timers.
export function loadLocal<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
export function saveLocal(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {}
}
