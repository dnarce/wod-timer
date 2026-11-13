// Bus en memoria SOLO para desarrollo local (next dev / un servidor Node propio).
// En Vercel cada request puede caer en otra instancia, por eso allá se usa Ably.

type Sub = (data: string) => void;
type Room = { last: string | null; subs: Set<Sub> };

const g = globalThis as unknown as { __wodBus?: Map<string, Room> };
const rooms = (g.__wodBus ??= new Map<string, Room>());

function room(id: string): Room {
  let r = rooms.get(id);
  if (!r) rooms.set(id, (r = { last: null, subs: new Set() }));
  return r;
}

export function subscribe(id: string, fn: Sub): () => void {
  const r = room(id);
  r.subs.add(fn);
  if (r.last) fn(r.last);
  return () => r.subs.delete(fn);
}

export function publish(id: string, data: string) {
  const r = room(id);
  r.last = data;
  r.subs.forEach((fn) => fn(data));
}
