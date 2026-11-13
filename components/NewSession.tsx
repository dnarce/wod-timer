"use client";
import { useEffect, useState } from "react";
import { TV_NAME_KEY, cleanName, sessionHash, type Creds } from "@/lib/session";
import { saveLocal } from "@/lib/transport";

// /new → crea una sesión nueva y redirige a la URL permanente de esa sesión (/#id.llave).
// Un refresco accidental después de la redirección retoma la misma sesión; sólo volver a abrir /new empieza otra.
export default function NewSession() {
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let dead = false;
    (async () => {
      const nombre = new URLSearchParams(location.search).get("nombre");
      // El nombre "lindo" queda en la tele (el id sólo guarda una versión corta). Sin ?nombre se conserva el anterior.
      if (cleanName(nombre)) saveLocal(TV_NAME_KEY, cleanName(nombre));
      const r = await fetch(`/api/session${nombre ? `?nombre=${encodeURIComponent(nombre)}` : ""}`, { method: "POST" });
      if (!r.ok) throw new Error(String(r.status));
      const s = (await r.json()) as Creds;
      if (!dead) location.replace(`/${sessionHash(s)}`);
    })().catch(() => !dead && setError("No pude crear la sesión. Recargá la página."));
    return () => {
      dead = true;
    };
  }, []);
  return (
    <main className="grid min-h-dvh flex-1 place-items-center p-8 text-center">
      <p className="font-cond text-3xl font-extrabold tracking-[3px]">{error ?? "CREANDO SESIÓN…"}</p>
    </main>
  );
}
