// Limitador de pedidos por ventana fija, en memoria. Funciones puras (el reloj se inyecta para probarlo).
//
// OJO: en Vercel cada instancia tiene su propia memoria, así que esto frena sobre todo a un único origen que
// insiste (y a los intentos de contraseña). Para un tope firme hay que sumar una regla del firewall de Vercel
// (ver README, "Publicar en Vercel").

export type Hit = { ok: boolean; retryAfterSec: number };

type Entry = { n: number; reset: number };

export class RateLimiter {
  private m = new Map<string, Entry>();
  private maxKeys: number;

  constructor(maxKeys = 5000) {
    this.maxKeys = maxKeys;
  }

  private entry(key: string, windowMs: number, now: number): Entry {
    let e = this.m.get(key);
    if (!e || e.reset <= now) {
      e = { n: 0, reset: now + windowMs };
      this.m.set(key, e);
      this.prune(now);
    }
    return e;
  }

  /** Cuenta un pedido y dice si entra dentro del límite (`limit` pedidos por ventana). */
  hit(key: string, limit: number, windowMs: number, now = Date.now()): Hit {
    const e = this.entry(key, windowMs, now);
    e.n++;
    return { ok: e.n <= limit, retryAfterSec: Math.max(1, Math.ceil((e.reset - now) / 1000)) };
  }

  /** Mira sin contar: ¿ya se alcanzó el límite en la ventana actual? (para contar sólo los intentos fallidos) */
  blocked(key: string, limit: number, now = Date.now()): Hit {
    const e = this.m.get(key);
    if (!e || e.reset <= now) return { ok: true, retryAfterSec: 0 };
    return { ok: e.n < limit, retryAfterSec: Math.max(1, Math.ceil((e.reset - now) / 1000)) };
  }

  reset(key: string) {
    this.m.delete(key);
  }

  get size() {
    return this.m.size;
  }

  // Evita que la memoria crezca sin límite: primero se tiran las ventanas vencidas, y si aún sobra, las más viejas.
  private prune(now: number) {
    if (this.m.size <= this.maxKeys) return;
    for (const [k, e] of this.m) if (e.reset <= now) this.m.delete(k);
    for (const k of this.m.keys()) {
      if (this.m.size <= this.maxKeys) break;
      this.m.delete(k);
    }
  }
}
