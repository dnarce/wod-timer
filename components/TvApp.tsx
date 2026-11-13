"use client";
import { useEffect, useRef, useState } from "react";
import { COND, Stage, THEMES } from "./Stage";
import { TimerPanel } from "./TimerPanel";
import { Qr } from "./Qr";
import { emptyState, tvLayout, type SessionState } from "@/lib/state";
import { TV_NAME_KEY, cleanName, parseSessionHash, sessionHash, sessionLabel, type Creds } from "@/lib/session";
import { serverNow, syncClock, transportKind } from "@/lib/clock";
import { connect, loadLocal, saveLocal } from "@/lib/transport";

export const PLANI_URL = "https://incafitnessclub.github.io/inca-planning/";
const SESSION_KEY = "wod:tv:session";
const STATE_KEY = "wod:tv:state";

type Session = Creds;

export default function TvApp() {
  const [session, setSession] = useState<Session | null>(null);
  const [state, setState] = useState<SessionState>(emptyState());
  const [now, setNow] = useState(0);
  const [online, setOnline] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showQr, setShowQr] = useState(true); // QR chico en la esquina: 30 s al abrir, o al tocar la pantalla
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // 1) Reloj + sesión (se crea una vez y queda guardada: el QR no cambia si se reinicia la tele)
  useEffect(() => {
    let dead = false;
    (async () => {
      await syncClock();
      if (transportKind() === "unconfigured") {
        setError("Falta configurar ABLY_API_KEY en el servidor.");
        return;
      }
      // Prioridad: sesión del link (#id.llave, el favorito de la tele) > la guardada > una nueva.
      const fromUrl = parseSessionHash(location.hash);
      const stored = loadLocal<Session>(SESSION_KEY);
      let s: Session | null = fromUrl ?? stored;
      if (fromUrl && stored?.id !== fromUrl.id) {
        // Otra sesión: no arrastrar el estado de la anterior.
        saveLocal(SESSION_KEY, fromUrl);
        localStorage.removeItem(STATE_KEY);
      }
      if (!s) {
        const r = await fetch("/api/session", { method: "POST" });
        s = (await r.json()) as Session;
        if (dead) return; // evita crear dos sesiones si el efecto se monta dos veces (modo estricto)
        saveLocal(SESSION_KEY, s);
      }
      // El link de la tele siempre lleva su sesión: así sobrevive si el navegador borra los datos.
      history.replaceState(null, "", location.pathname + sessionHash(s));
      const saved = loadLocal<SessionState>(STATE_KEY);
      if (saved && !dead) setState(saved);
      if (!dead) setSession(s);
    })().catch(() => setError("No pude conectarme al servidor."));
    const t = setInterval(() => void syncClock(), 60_000);
    return () => {
      dead = true;
      clearInterval(t);
    };
  }, []);

  // 2) Canal en tiempo real
  useEffect(() => {
    if (!session) return;
    let link: Awaited<ReturnType<typeof connect>> | null = null;
    let dead = false;
    let renewing = false;
    // La sesión se cerró (desde /sesiones): pedimos una nueva con el mismo nombre y volvemos al QR.
    const renew = async () => {
      if (renewing) return;
      renewing = true;
      try {
        const nombre = sessionLabel(session.id);
        const r = await fetch(`/api/session${nombre ? `?nombre=${encodeURIComponent(nombre)}` : ""}`, { method: "POST" });
        const next = (await r.json()) as Session;
        if (dead) return;
        saveLocal(SESSION_KEY, next);
        localStorage.removeItem(STATE_KEY);
        history.replaceState(null, "", location.pathname + sessionHash(next));
        setState(emptyState());
        setSession(next);
      } catch {
        renewing = false;
      }
    };
    // El nombre de la tele vive en este navegador (sobrevive a los reinicios de sesión). Se anuncia por presencia
    // para que /sesiones lo muestre, y /sesiones puede cambiarlo con una orden "rename".
    const name = cleanName(loadLocal<string>(TV_NAME_KEY) ?? sessionLabel(session.id));
    connect({
      id: session.id,
      ctl: session.ctl,
      role: "tv",
      onConnection: setOnline,
      presence: { role: "tv", name },
      onRename: (n) => {
        const c = cleanName(n);
        saveLocal(TV_NAME_KEY, c);
        void link?.setPresence({ role: "tv", name: c });
      },
      onState: (s) => {
        if (s.closed) {
          void renew();
          return;
        }
        if (s.rev > stateRef.current.rev) {
          setState(s);
          saveLocal(STATE_KEY, s);
        }
      },
    })
      .then((l) => (dead ? l.close() : (link = l)))
      .catch(() => setError("No pude abrir el canal en tiempo real."));
    return () => {
      dead = true;
      link?.close();
    };
  }, [session]);

  // 3) Tic de 100 ms sobre la hora del servidor
  useEffect(() => {
    const t = setInterval(() => setNow(serverNow()), 100);
    return () => clearInterval(t);
  }, []);

  // El QR se oculta solo a los 30 s de mostrarse (al abrir la tele o después de cada toque).
  useEffect(() => {
    if (!showQr) return;
    const t = setTimeout(() => setShowQr(false), 30_000);
    return () => clearTimeout(t);
  }, [showQr]);

  // 4) Tocar la pantalla (o una tecla del control remoto) muestra u oculta el QR de la esquina, en cualquier modo:
  //    así se puede volver a vincular un celular aunque haya timers a pantalla completa.
  //    La tele no emite sonido: los beeps suenan en el celular del profe, junto a su música.
  useEffect(() => {
    const on = () => setShowQr((v) => !v);
    window.addEventListener("pointerdown", on);
    window.addEventListener("keydown", on);
    return () => {
      window.removeEventListener("pointerdown", on);
      window.removeEventListener("keydown", on);
    };
  }, []);

  // 5) Mantener la pantalla prendida
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    const ask = () => {
      const wl = (navigator as unknown as { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } }).wakeLock;
      wl?.request("screen").then((l) => (lock = l)).catch(() => {});
    };
    ask();
    document.addEventListener("visibilitychange", ask);
    return () => {
      document.removeEventListener("visibilitychange", ask);
      void lock?.release();
    };
  }, []);

  const th = THEMES[state.theme];
  const dark = state.theme === "noche";
  const controlUrl = session && typeof location !== "undefined" ? `${location.origin}/c#${session.id}.${session.ctl}` : "";

  if (error) {
    return (
      <Stage theme="noche">
        <div style={{ height: "100%", display: "grid", placeItems: "center", fontFamily: COND, fontWeight: 800, fontSize: 64, letterSpacing: 3, textAlign: "center", padding: 120 }}>{error}</div>
      </Stage>
    );
  }
  if (!session || !now) return <Stage theme="noche">{null}</Stage>;

  const layout = tvLayout(state, now);
  // La tele muestra el QR mientras ningún celular tenga el control (al inicio o tras "Cerrar sesión").
  const paired = !!state.controller;

  // --- Pantalla de vinculación ---
  if (!paired) {
    return (
      <Stage theme="noche">
        <div style={{ height: 1080, display: "flex", flexDirection: "column" }}>
          <div style={{ height: 10, background: "#D4FF00" }} />
          <div style={{ display: "flex", alignItems: "center", padding: "40px 96px 0" }}>
            <Brand size={56} />
          </div>
          <div style={{ flexGrow: 1, display: "flex", alignItems: "center", gap: 120, padding: "0 96px" }}>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 48 }}>
              <span style={{ alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: 14, padding: "10px 22px", borderRadius: 999, background: th.panel, border: `2px solid ${th.line}`, fontFamily: COND, fontWeight: 700, fontSize: 26, letterSpacing: 3, color: th.muted }}>
                <span style={{ width: 14, height: 14, borderRadius: "50%", background: online ? "#D4FF00" : "#FF6B1A" }} />
                {online ? "TV LISTA" : "CONECTANDO…"}
              </span>
              <h1 style={{ margin: 0, fontFamily: COND, fontWeight: 900, fontSize: 176, lineHeight: 0.86, letterSpacing: -2, textTransform: "uppercase" }}>
                Escaneá<br />y tomá el<br />
                <span style={{ color: "#D4FF00" }}>control</span>
              </h1>
              <div style={{ display: "flex", gap: 40 }}>
                {["Abrí la cámara del celu y apuntá al QR", "Elegí qué mostrar: plani o timers", "Armá hasta 3 timers y largalos"].map((s, i) => (
                  <div key={s} style={{ maxWidth: 300, display: "flex", flexDirection: "column", gap: 8 }}>
                    <span style={{ fontFamily: COND, fontWeight: 900, fontSize: 56, lineHeight: 1, color: "#D4FF00" }}>0{i + 1}</span>
                    <span style={{ fontSize: 26, fontWeight: 600, lineHeight: 1.25 }}>{s}</span>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ padding: 36, background: "#fff", borderRadius: 36, border: "10px solid #D4FF00" }}>
              {controlUrl && <Qr text={controlUrl} size={500} />}
            </div>
          </div>
        </div>
      </Stage>
    );
  }

  // --- Plani sola ---
  const planiFrame = (
    <iframe src={PLANI_URL} title="Planificación del día" style={{ width: "100%", height: "100%", border: 0, background: "#fff" }} />
  );
  const cornerQr = controlUrl && showQr && (
    <div style={{ position: "absolute", zIndex: 5, right: layout.mode === "split" ? 544 : 24, bottom: 24, display: "flex", alignItems: "center", gap: 14, padding: "10px 18px 10px 10px", borderRadius: 18, background: "rgba(7,8,11,0.88)", color: "#fff" }}>
      <div style={{ background: "#fff", padding: 6, borderRadius: 10 }}>
        <Qr text={controlUrl} size={84} />
      </div>
      <div style={{ fontFamily: COND, fontWeight: 800, fontSize: 26, letterSpacing: 2, lineHeight: 1.1 }}>
        CONTROL
        <div style={{ fontSize: 18, fontWeight: 600, color: "#9CA1AD", letterSpacing: 1 }}>escaneá para manejar</div>
      </div>
    </div>
  );

  let body;
  if (layout.mode === "plani") {
    body = planiFrame;
  } else if (layout.mode === "split") {
    body = (
      <div style={{ display: "flex", height: "100%" }}>
        <div style={{ position: "relative", flex: 1 }}>{planiFrame}</div>
        <div style={{ flex: "0 0 520px", borderLeft: `2px solid ${th.line}`, background: th.panel, display: "grid", gridTemplateRows: `repeat(${layout.timers.length}, minmax(0, 1fr))` }}>
          {layout.timers.map((t, i) => (
            <div key={t.id} style={{ minHeight: 0, borderTop: i ? `2px solid ${th.line}` : "none" }}>
              <TimerPanel t={t} now={now} th={th} size="side" dark={dark} count={layout.timers.length} />
            </div>
          ))}
        </div>
      </div>
    );
  } else {
    const n = layout.timers.length;
    body = (
      <div style={{ height: "100%", boxSizing: "border-box", padding: n === 1 ? 0 : 24, display: "grid", gridTemplateRows: `repeat(${n}, minmax(0, 1fr))`, gap: 20 }}>
        {layout.timers.map((t, i) => (
          // Con 2 o 3 timers se alternan: 1 número a la derecha, 2 a la izquierda, 3 a la derecha.
          <TimerPanel key={t.id} t={t} now={now} th={th} size={n === 1 ? "solo" : n === 2 ? "two" : "three"} dark={dark} flip={i % 2 === 1} />
        ))}
      </div>
    );
  }

  return (
    <Stage theme={state.theme}>
      {body}
      {cornerQr}
    </Stage>
  );
}

export function Brand({ size }: { size: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: size * 0.28 }}>
      <span style={{ width: size, height: size, borderRadius: size * 0.27, background: "#D4FF00", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <svg width={size * 0.6} height={size * 0.6} viewBox="0 0 24 24" fill="none" stroke="#07080B" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="13" r="8" />
          <path d="M12 9v4l3 2M10 2h4" />
        </svg>
      </span>
      <span style={{ fontFamily: COND, fontWeight: 900, fontSize: size, letterSpacing: size * 0.07, whiteSpace: "nowrap" }}>
        WOD TV <span style={{ fontWeight: 600, opacity: 0.6 }}>TIMER</span>
      </span>
    </div>
  );
}
