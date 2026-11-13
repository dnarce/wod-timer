"use client";
// Reloj compartido: offset entre el reloj local y el del servidor.
let offset = 0;
export type TransportKind = "ably" | "dev" | "unconfigured";
let kind: TransportKind = "dev";

export const serverNow = () => Date.now() + offset;
export const transportKind = () => kind;

async function sample(): Promise<{ off: number; rtt: number; transport: TransportKind } | null> {
  try {
    const t0 = Date.now();
    const r = await fetch("/api/sync", { cache: "no-store" });
    const t1 = Date.now();
    const j = (await r.json()) as { now: number; transport: TransportKind };
    return { off: j.now - (t0 + t1) / 2, rtt: t1 - t0, transport: j.transport };
  } catch {
    return null;
  }
}

/** Toma 4 muestras y se queda con la de menor latencia. */
export async function syncClock(): Promise<void> {
  const samples: NonNullable<Awaited<ReturnType<typeof sample>>>[] = [];
  for (let i = 0; i < 4; i++) {
    const s = await sample();
    if (s) samples.push(s);
  }
  if (!samples.length) return;
  const best = samples.reduce((a, b) => (b.rtt < a.rtt ? b : a));
  offset = best.off;
  kind = best.transport;
}
