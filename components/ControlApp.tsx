"use client";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { buildPhases, describe, fmt, fmtShort, totalSec, type TimerConfig } from "@/lib/engine";
import {
  COLORS,
  MAX_TIMERS,
  defaultConfig,
  emptyState,
  newTimer,
  nudgeTimer,
  pauseTimer,
  resetTimer,
  skipPhase,
  startTimer,
  statusOf,
  viewOf,
  type SessionState,
  type TimerState,
  type ViewMode,
} from "@/lib/state";
import { serverNow, syncClock, transportKind } from "@/lib/clock";
import { connect, loadLocal, saveLocal, type Link } from "@/lib/transport";
import { controlOf, findSessionIn, parseSessionHash, sessionHash, type Creds } from "@/lib/session";
import { useBeeps } from "@/lib/useBeeps";
import { beep, unlockAudio } from "@/lib/beep";
import { Brand } from "./TvApp";

type Screen = { name: "home" } | { name: "edit"; id: string | null } | { name: "live"; id: string };

const CRED_KEY = "wod:c:creds";
const SOUND_KEY = "wod:c:sound"; // beeps en este celular (sí/no)
const DEVICE_KEY = "wod:c:device"; // id propio de este celular (para saber quién tiene el control)
const CLAIM_KEY = "wod:c:claimed"; // sessionStorage: esta pestaña ya tomó el control de esta sesión (recargar no lo retoma)
const stateKey = (id: string) => `wod:c:state:${id}`;

/** Olvida la sesión en este celular y saca la llave de la URL. */
function dropCreds(id: string) {
  try {
    localStorage.removeItem(CRED_KEY);
    localStorage.removeItem(stateKey(id));
    sessionStorage.removeItem(CLAIM_KEY);
  } catch {}
  history.replaceState(null, "", location.pathname);
}

const cond = "font-cond";
const label = `${cond} text-[15px] font-bold tracking-[3px] text-muted uppercase`;

export default function ControlApp() {
  const [creds, setCreds] = useState<Creds | null>(null);
  const [state, setState] = useState<SessionState>(emptyState());
  const [screen, setScreen] = useState<Screen>({ name: "home" });
  const [now, setNow] = useState(0);
  const [online, setOnline] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [undo, setUndo] = useState<{ timer: TimerState; index: number } | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [deviceId, setDeviceId] = useState("");
  const [closed, setClosed] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [copied, setCopied] = useState<"tv" | "ctl" | null>(null);
  const [unlinked, setUnlinked] = useState(false); // sin sesión guardada ni link
  const [paste, setPaste] = useState("");
  const [pasteError, setPasteError] = useState(false);
  const [sound, setSound] = useState(() => loadLocal<boolean>(SOUND_KEY) ?? true);
  const deviceRef = useRef("");
  const fromScanRef = useRef(false); // true si entró escaneando el QR: eso toma el control
  const linkRef = useRef<Link | null>(null);
  const stateRef = useRef(state);
  const credsRef = useRef(creds);
  useEffect(() => {
    credsRef.current = creds;
  }, [creds]);

  // Credenciales: vienen en el hash del link de control (#id.llave, el mismo del QR) y se recuerdan en el celular.
  // El hash se deja en la URL a propósito: guardar el link (favorito o pantalla de inicio) recupera el control
  // aunque se borren los datos del navegador. Es la misma llave que la tele muestra en su QR.
  const adopt = useCallback((c: Creds, claim: boolean) => {
    fromScanRef.current = claim; // abrir el link toma el control
    saveLocal(CRED_KEY, c);
    try {
      sessionStorage.setItem(CLAIM_KEY, c.id);
    } catch {}
    history.replaceState(null, "", location.pathname + sessionHash(c));
    setClosed(false);
    setUnlinked(false);
    setError(null);
    setCreds(c);
  }, []);

  useEffect(() => {
    let dev = loadLocal<string>(DEVICE_KEY);
    if (!dev) {
      dev = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
      saveLocal(DEVICE_KEY, dev);
    }
    deviceRef.current = dev;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lectura única de location/localStorage, que no existen en el servidor
    setDeviceId(dev);
    // Abrir el link toma el control, salvo al recargar la misma pestaña (el marcador de sessionStorage lo evita).
    // Si la pestaña ya estaba abierta el navegador sólo cambia el hash (no recarga): por eso `hashchange`.
    const applyHash = (isMount: boolean): boolean => {
      const c = parseSessionHash(location.hash);
      if (!c) return false;
      let already = false;
      try {
        already = isMount && sessionStorage.getItem(CLAIM_KEY) === c.id;
      } catch {}
      adopt(c, !already);
      return true;
    };
    if (!applyHash(true)) {
      const saved = loadLocal<Creds>(CRED_KEY);
      if (saved) {
        // Reabrir /c sin link: se retoma la sesión guardada, y la URL pasa a llevar el link (para guardarlo).
        try {
          sessionStorage.setItem(CLAIM_KEY, saved.id);
        } catch {}
        history.replaceState(null, "", location.pathname + sessionHash(saved));
        setCreds(saved);
      } else setUnlinked(true);
    }
    const onHash = () => void applyHash(false);
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [adopt]);

  const commit = useCallback((fn: (s: SessionState, t: number) => SessionState) => {
    const t = serverNow();
    const cur = stateRef.current;
    const next = fn(cur, t);
    next.rev = Math.max(cur.rev + 1, Date.now());
    // Cualquier acción de este celular implica que tiene el control.
    next.controller = deviceRef.current || next.controller;
    stateRef.current = next;
    setState(next);
    if (credsRef.current) saveLocal(stateKey(credsRef.current.id), next);
    linkRef.current?.publish(next);
  }, []);

  // Conexión
  useEffect(() => {
    if (!creds) return;
    let dead = false;
    let got = false; // ¿ya llegó el último estado desde el canal?
    (async () => {
      await syncClock();
      if (transportKind() === "unconfigured") {
        setError("Falta configurar ABLY_API_KEY en el servidor.");
        return;
      }
      const saved = loadLocal<SessionState>(stateKey(creds.id));
      if (saved) {
        stateRef.current = saved;
        setState(saved);
      }
      const link = await connect({
        id: creds.id,
        ctl: creds.ctl,
        onConnection: setOnline,
        onState: (s) => {
          got = true;
          // La sesión se cerró (desde /sesiones), o este celular estaba desvinculado y el profe que mandaba
          // cerró sesión: nos despedimos también.
          if (s.closed || (s.rev > stateRef.current.rev && controlOf(stateRef.current, deviceRef.current) === "other" && controlOf(s, deviceRef.current) === "free")) {
            dropCreds(creds.id);
            setClosed(true);
            setCreds(null);
            return;
          }
          if (s.rev > stateRef.current.rev) {
            stateRef.current = s;
            setState(s);
            saveLocal(stateKey(creds.id), s);
          }
        },
      });
      if (dead) return link.close();
      linkRef.current = link;
      // Esperamos el último estado del canal antes de actuar, para no pisar los timers del profe anterior.
      const t0 = Date.now();
      const iv = setInterval(() => {
        if (dead) return clearInterval(iv);
        if (!got && Date.now() - t0 < 1500) return;
        clearInterval(iv);
        const ctrl = controlOf(stateRef.current, deviceRef.current);
        if (fromScanRef.current || ctrl === "free") {
          // Escanear el QR toma el control (el celular anterior se desvincula solo).
          // Reabrir el celular sólo lo toma si nadie lo tiene.
          fromScanRef.current = false;
          commit((s) => ({ ...s, controller: deviceRef.current }));
        } else if (ctrl === "me") {
          void link.publish(stateRef.current); // re-sincroniza la tele
        } // si lo tiene otro, no publicamos nada: se muestra la pantalla de "tomó el control"
      }, 100);
    })().catch(() => setError("No pude conectarme."));
    return () => {
      dead = true;
      linkRef.current?.close();
      linkRef.current = null;
    };
  }, [creds, commit]);

  // Los navegadores sólo dejan sonar después de un toque: el primero desbloquea el audio.
  useEffect(() => {
    const on = () => unlockAudio();
    window.addEventListener("pointerdown", on);
    return () => window.removeEventListener("pointerdown", on);
  }, []);
  // Los beeps suenan acá (junto a la música del profe), no en la tele.
  useBeeps(state.timers, now, sound && !!creds && controlOf(state, deviceId) !== "other");

  useEffect(() => {
    const t = setInterval(() => setNow(serverNow()), 250);
    return () => clearInterval(t);
  }, []);

  if (error) {
    return (
      <Shell>
        <p className="mt-24 text-center text-lg font-semibold">{error}</p>
      </Shell>
    );
  }
  if (closed || unlinked) {
    return (
      <Shell>
        <div className="mt-16 flex flex-col items-center gap-3 text-center">
          <h1 className={`${cond} text-[32px] leading-none font-black tracking-[1px]`}>{closed ? "SESIÓN CERRADA" : "VINCULÁ ESTE CELULAR"}</h1>
          <p className="text-[15px] text-muted">Escaneá el QR de la tele, o pegá el link de control.</p>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const c = findSessionIn(paste);
            if (c) adopt(c, true);
            else setPasteError(true);
          }}
          className="flex flex-col gap-2"
        >
          <label htmlFor="paste-link" className={label}>Link de control</label>
          <input
            id="paste-link"
            value={paste}
            onChange={(e) => {
              setPaste(e.target.value);
              setPasteError(false);
            }}
            placeholder="Pegá el link acá"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            className="h-12 rounded-xl border border-line bg-panel px-3.5 text-[15px]"
          />
          {pasteError && (
            <p role="alert" className="text-[14px] font-semibold text-[#FF3D8B]">
              No encuentro un link de control ahí: tiene que terminar en # y un código.
            </p>
          )}
          <button type="submit" className={`${cond} h-14 rounded-2xl bg-volt text-[19px] font-black tracking-[2px] text-[#07080B]`}>
            VINCULAR
          </button>
        </form>
      </Shell>
    );
  }
  if (!creds || !now) return <Shell>{null}</Shell>;

  const forget = () => {
    dropCreds(creds.id);
    setClosed(true);
    setCreds(null);
  };
  // "Cerrar sesión": suelta el control, borra los timers y la tele vuelve al QR.
  const releaseSession = async () => {
    const cur = stateRef.current;
    const next: SessionState = { ...emptyState(), theme: cur.theme, rev: Math.max(cur.rev + 1, Date.now()) };
    stateRef.current = next;
    try {
      await linkRef.current?.publish(next);
    } catch {}
    forget();
  };
  const copyLink = async (which: "tv" | "ctl", inputId: string, link: string) => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(which);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      (document.getElementById(inputId) as HTMLInputElement | null)?.select(); // sin HTTPS el navegador no deja copiar solo: queda seleccionado
    }
  };

  // Otro celular escaneó el QR después: este queda desvinculado.
  if (controlOf(state, deviceId) === "other") {
    return (
      <Shell>
        <div className="mt-16 flex flex-col items-center gap-3 text-center">
          <h1 className={`${cond} text-[32px] leading-none font-black tracking-[1px]`}>OTRO CELULAR TOMÓ EL CONTROL</h1>
          <p className="text-[15px] text-muted">Este celular ya no maneja la tele.</p>
        </div>
        <div className="flex flex-col gap-2">
          <button type="button" onClick={() => commit((s) => ({ ...s, controller: deviceRef.current }))} className={`${cond} h-14 rounded-2xl bg-volt text-[19px] font-black tracking-[2px] text-[#07080B]`}>
            RETOMAR EL CONTROL
          </button>
          <button type="button" onClick={forget} className={`${cond} h-14 rounded-2xl border border-line bg-panel text-[19px] font-extrabold tracking-[2px]`}>
            SALIR
          </button>
        </div>
      </Shell>
    );
  }

  const timerById = (id: string | null) => state.timers.find((t) => t.id === id);

  const setView = (view: ViewMode) => commit((s) => ({ ...s, view }));
  const patch = (id: string, f: (t: TimerState, n: number) => TimerState) =>
    commit((s, n) => ({ ...s, timers: s.timers.map((t) => (t.id === id ? f(t, n) : t)) }));
  const toggleRun = (t: TimerState) =>
    commit((s, n) => ({
      ...s,
      view: t.resumedAt === null && s.view === "plani" ? "timers" : s.view,
      timers: s.timers.map((x) => (x.id === t.id ? (x.resumedAt === null ? startTimer(x, n) : pauseTimer(x, n)) : x)),
    }));
  const remove = (id: string) => {
    const index = state.timers.findIndex((t) => t.id === id);
    setUndo({ timer: state.timers[index], index });
    setConfirm(null);
    commit((s) => ({ ...s, timers: s.timers.filter((t) => t.id !== id) }));
  };
  const restore = () => {
    if (!undo) return;
    const u = undo;
    setUndo(null);
    commit((s) => {
      const timers = s.timers.slice();
      timers.splice(u.index, 0, u.timer);
      return { ...s, timers };
    });
  };

  // ---------- Editor ----------
  if (screen.name === "edit") {
    const existing = timerById(screen.id);
    return (
      <Editor
        key={screen.id ?? "new"}
        initial={existing ?? newTimer(state.timers.length)}
        isNew={!existing}
        onCancel={() => setScreen({ name: "home" })}
        onSave={(t, launch) => {
          commit((s, n) => {
            const fresh = resetTimer(t);
            const timers = existing ? s.timers.map((x) => (x.id === t.id ? fresh : x)) : [...s.timers, fresh];
            if (!launch) return { ...s, timers };
            return { ...s, view: s.view === "plani" ? "timers" : s.view, timers: timers.map((x) => (x.id === t.id ? startTimer(x, n) : x)) };
          });
          setScreen(launch ? { name: "live", id: t.id } : { name: "home" });
        }}
      />
    );
  }

  // ---------- Timer en vivo ----------
  if (screen.name === "live") {
    const t = timerById(screen.id);
    if (!t) {
      setScreen({ name: "home" });
      return null;
    }
    const v = viewOf(t, now);
    const status = statusOf(t, now);
    return (
      <Shell>
        <div className="flex items-center justify-between">
          <button type="button" aria-label="Volver" onClick={() => setScreen({ name: "home" })} className="-ml-3 grid size-11 place-items-center">
            <Icon d="M15 6l-6 6 6 6" />
          </button>
          <Pill ok={online} text={t.onTv ? "En vivo en la tele" : "Fuera de la tele"} />
        </div>
        <div className="rounded-3xl p-5 text-[#07080B]" style={{ background: t.color }}>
          <div className="flex items-baseline justify-between">
            <span className={`${cond} text-[30px] font-black`}>{t.name}</span>
            <span className={`${cond} text-lg font-extrabold tracking-[2px]`}>
              {status === "finished" ? "FIN" : v.phase.type === "precount" ? "ARRANCA EN" : v.phase.of > 1 ? `${v.phase.label} ${v.phase.index}/${v.phase.of}` : v.phase.label}
            </span>
          </div>
          <div className={`${cond} text-[112px] font-black leading-[0.9] tracking-[-2px] tabular-nums`}>{fmt(v.displayMs, !!v.phase.up)}</div>
          <div className="mt-2 flex gap-1" style={{ height: 10 }}>
            {buildPhases(t.config, t.precount).map((p, i) =>
              p.type === "precount" ? null : (
                <div key={i} className="overflow-hidden rounded" style={{ flex: `${p.durSec} 1 0`, background: "rgba(7,8,11,0.2)" }}>
                  <div className="h-full" style={{ width: `${v.progress[i] * 100}%`, background: p.type === "rest" ? "rgba(7,8,11,0.55)" : "#07080B" }} />
                </div>
              ),
            )}
          </div>
          <p className="mt-2 text-sm font-bold">{describe(t.config)}</p>
        </div>

        <div className="flex items-center justify-center gap-5 py-1">
          <RoundBtn aria="Restar 10 segundos" onClick={() => patch(t.id, (x, n) => nudgeTimer(x, n, -10_000))}>−10</RoundBtn>
          <button type="button" aria-label={t.resumedAt === null ? "Largar" : "Pausar"} onClick={() => toggleRun(t)} className="grid size-[120px] place-items-center rounded-full bg-white text-[#07080B]">
            {t.resumedAt !== null && status !== "finished" ? (
              <svg width="44" height="44" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
            ) : (
              <svg width="44" height="44" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15l12-7.5z" /></svg>
            )}
          </button>
          <RoundBtn aria="Sumar 10 segundos" onClick={() => patch(t.id, (x, n) => nudgeTimer(x, n, 10_000))}>+10</RoundBtn>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Action onClick={() => patch(t.id, (x) => resetTimer(x))}>REINICIAR</Action>
          <Action onClick={() => patch(t.id, (x, n) => skipPhase(x, n))}>SALTAR TRAMO</Action>
        </div>
        <label className="flex min-h-14 items-center justify-between rounded-2xl border border-line bg-panel px-4 text-[15px] font-semibold">
          Visible en la tele
          <input type="checkbox" checked={t.onTv} onChange={() => patch(t.id, (x) => ({ ...x, onTv: !x.onTv }))} className="size-[22px]" style={{ accentColor: t.color }} />
        </label>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => {
            patch(t.id, (x) => ({ ...resetTimer(x), onTv: false }));
            setScreen({ name: "home" });
          }}
          className={`${cond} h-14 rounded-2xl border-2 text-[19px] font-black tracking-[2px]`}
          style={{ borderColor: t.color, color: t.color }}
        >
          TERMINAR TIMER
        </button>
      </Shell>
    );
  }

  // ---------- Home ----------
  const views: { id: ViewMode; name: string; d: string }[] = [
    { id: "plani", name: "PLANI", d: "M3 4h18v16H3zM9 4v16M15 4v16" },
    { id: "timers", name: "TIMERS", d: "M12 5a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM12 9v4l2.5 2.5M10 2h4" },
    { id: "split", name: "SPLIT", d: "M3 4h18v16H3zM15 4v16" },
  ];
  return (
    <Shell>
      <div className="flex items-center justify-between">
        <Brand size={26} />
        <Pill ok={online} text={online ? "TV conectada" : "Sin conexión"} />
      </div>

      <section className="flex flex-col gap-2.5">
        <h2 className={label}>En la tele</h2>
        <div className="grid grid-cols-3 gap-2">
          {views.map((v) => {
            const on = state.view === v.id;
            return (
              <button key={v.id} type="button" aria-pressed={on} onClick={() => setView(v.id)} className={`flex h-[72px] flex-col items-center justify-center gap-1 rounded-2xl border ${on ? "border-volt bg-volt text-[#07080B]" : "border-line bg-panel"}`}>
                <Icon d={v.d} />
                <span className={`${cond} text-[17px] font-extrabold tracking-[2px]`}>{v.name}</span>
              </button>
            );
          })}
        </div>
        <div className="flex items-center justify-between px-0.5">
          <span className="text-[15px] font-semibold text-muted">Modo de la tele</span>
          <div className="flex rounded-full border border-line bg-panel p-1">
            {(["dia", "noche"] as const).map((th) => (
              <button key={th} type="button" aria-pressed={state.theme === th} onClick={() => commit((s) => ({ ...s, theme: th }))} className={`h-9 rounded-full px-4 text-sm font-bold ${state.theme === th ? "bg-white text-[#07080B]" : "text-muted"}`}>
                {th === "dia" ? "Día" : "Noche"}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="flex flex-1 flex-col gap-2.5">
        <div className="flex items-center justify-between">
          <h2 className={label}>Tus timers · {state.timers.length} / {MAX_TIMERS}</h2>
          {state.timers.length > 0 && (
            <button type="button" onClick={() => commit((s) => ({ ...s, timers: s.timers.map((t) => ({ ...resetTimer(t), onTv: false })) }))} className={`${cond} flex h-9 items-center gap-1.5 rounded-[10px] border border-line px-3 text-sm font-extrabold tracking-[2px]`}>
              <Icon d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5" size={14} />
              TODOS A CERO
            </button>
          )}
        </div>

        {undo && (
          <div role="status" className="flex items-center justify-between rounded-xl bg-white py-1.5 pr-1.5 pl-3.5 text-[#07080B]">
            <span className="text-sm font-semibold">{undo.timer.name} eliminado</span>
            <button type="button" onClick={restore} className="h-9 rounded-lg bg-[#07080B] px-3 text-sm font-bold text-white">Deshacer</button>
          </div>
        )}

        {state.timers.length === 0 && !undo && <p className="rounded-2xl border border-dashed border-line p-5 text-center text-[15px] text-muted">Todavía no hay timers. Armá uno para la clase.</p>}

        {state.timers.map((t) => {
          const status = statusOf(t, now);
          const v = viewOf(t, now);
          return (
            <div key={t.id} className="flex overflow-hidden rounded-2xl border border-line bg-panel">
              <div className="w-2" style={{ background: t.color }} />
              {confirm === t.id ? (
                <div className="flex flex-1 flex-col gap-3 p-3.5">
                  <span className="text-[15px] font-semibold">¿Eliminar <strong>{t.name}</strong>? Si está en la tele, desaparece.</span>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setConfirm(null)} className="h-11 flex-1 rounded-xl border border-line font-bold">Cancelar</button>
                    <button type="button" onClick={() => remove(t.id)} className="h-11 flex-1 rounded-xl bg-[#FF3D8B] font-extrabold text-[#07080B]">Eliminar</button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-1 flex-col gap-2.5 p-3.5">
                  <div className="flex items-start justify-between">
                    <div className="flex min-w-0 flex-col">
                      <span className={`${cond} text-2xl font-black tracking-[1px]`}>{t.name}</span>
                      <span className="text-sm font-semibold text-muted">{describe(t.config)}</span>
                    </div>
                    <div className="flex flex-col items-end">
                      <span className={`${cond} text-[34px] leading-none font-black tabular-nums`} style={{ color: status === "running" ? t.color : status === "ready" ? "#9CA1AD" : "#fff" }}>
                        {fmt(v.displayMs, !!v.phase.up)}
                      </span>
                      <span className={`${cond} text-[13px] font-extrabold tracking-[2px] text-muted`}>{{ ready: "A CERO · LISTO", running: "EN CURSO", paused: "EN PAUSA", finished: "TERMINÓ" }[status]}</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-1.5">
                    <label className="flex items-center gap-2 text-sm font-semibold">
                      <input type="checkbox" checked={t.onTv} onChange={() => patch(t.id, (x) => ({ ...x, onTv: !x.onTv }))} className="size-[22px]" style={{ accentColor: t.color }} />
                      En la tele
                    </label>
                    <div className="flex gap-1.5">
                      <IconBtn aria={`Eliminar ${t.name}`} d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" onClick={() => setConfirm(t.id)} />
                      <IconBtn aria={`Volver ${t.name} a cero`} d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5" onClick={() => patch(t.id, (x) => resetTimer(x))} />
                      <IconBtn aria={`Editar ${t.name}`} d="M4 20h4L19 9l-4-4L4 16v4z" onClick={() => setScreen({ name: "edit", id: t.id })} />
                      <IconBtn aria={`Abrir ${t.name}`} d="M9 6l6 6-6 6" onClick={() => setScreen({ name: "live", id: t.id })} />
                      <button type="button" aria-label={`${t.resumedAt === null ? "Largar" : "Pausar"} ${t.name}`} onClick={() => toggleRun(t)} className="grid size-11 place-items-center rounded-xl text-[#07080B]" style={{ background: t.color }}>
                        {t.resumedAt !== null && status !== "finished" ? (
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
                        ) : (
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15l12-7.5z" /></svg>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {state.timers.length < MAX_TIMERS && (
          <button type="button" onClick={() => setScreen({ name: "edit", id: null })} className={`${cond} flex h-14 items-center justify-center gap-2.5 rounded-2xl border-2 border-dashed border-[#2E323C] text-[19px] font-extrabold tracking-[2px]`}>
            <Icon d="M12 5v14M5 12h14" size={20} />
            NUEVO TIMER
          </button>
        )}
      </section>

      <button type="button" onClick={() => setView("plani")} className={`${cond} h-14 rounded-2xl border border-line bg-panel text-[19px] font-extrabold tracking-[2px]`}>
        VOLVER A LA PLANI
      </button>

      <details className="rounded-2xl border border-line bg-panel">
        <summary className={`${cond} flex min-h-14 cursor-pointer items-center px-4 text-[17px] font-extrabold tracking-[2px]`}>MÁS OPCIONES</summary>
        <div className="flex flex-col gap-3 px-4 pb-4">
          <div className="flex flex-col gap-1.5">
            <label className="flex min-h-11 items-center justify-between gap-3 text-[15px] font-semibold">
              Sonido de los timers en este celular
              <input
                type="checkbox"
                checked={sound}
                onChange={(e) => {
                  setSound(e.target.checked);
                  saveLocal(SOUND_KEY, e.target.checked);
                  unlockAudio();
                }}
                className="size-[22px] accent-[#D4FF00]"
              />
            </label>
            <p className="text-[13px] text-muted">Beeps en los últimos 3 s de cada tramo y al terminar. La tele no suena, así no se pisa con tu música. Dejá esta pantalla abierta.</p>
            <button
              type="button"
              onClick={() => {
                unlockAudio();
                setTimeout(() => beep("go"), 150);
              }}
              className={`${cond} h-11 self-start rounded-xl bg-line px-4 text-[15px] font-extrabold tracking-[2px]`}
            >
              PROBAR SONIDO
            </button>
          </div>
          <LinkField
            id="ctl-link"
            title="Link de control"
            hint="Pasáselo a otro profe, o guardalo como favorito o en la pantalla de inicio de tu celular: al abrirlo recuperás el control sin escanear nada."
            value={`${location.origin}/c${sessionHash(creds)}`}
            copied={copied === "ctl"}
            onCopy={() => void copyLink("ctl", "ctl-link", `${location.origin}/c${sessionHash(creds)}`)}
          />
          <LinkField
            id="tv-link"
            title="Link fijo de la tele"
            hint="Guardalo como favorito en el navegador de la tele: así la sesión no se pierde aunque se borren los datos."
            value={`${location.origin}/${sessionHash(creds)}`}
            copied={copied === "tv"}
            onCopy={() => void copyLink("tv", "tv-link", `${location.origin}/${sessionHash(creds)}`)}
          />
          {confirmClose ? (
            <div className="flex flex-col gap-2 rounded-xl border border-line p-3">
              <span className="text-[15px] font-semibold">¿Cerrar sesión? Se borran los timers y la tele vuelve al QR para el próximo profe.</span>
              <div className="flex gap-2">
                <button type="button" onClick={() => setConfirmClose(false)} className="h-11 flex-1 rounded-xl border border-line font-bold">Cancelar</button>
                <button type="button" onClick={() => void releaseSession()} className="h-11 flex-1 rounded-xl bg-[#FF3D8B] font-extrabold text-[#07080B]">Cerrar sesión</button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirmClose(true)} className={`${cond} h-12 rounded-xl border border-line text-[16px] font-extrabold tracking-[2px]`}>
              CERRAR SESIÓN
            </button>
          )}
        </div>
      </details>
    </Shell>
  );
}

// ---------- Editor ----------
type FieldDef = { key: string; label: string; step: number; min: number; max: number; time?: boolean };
const FIELDS: Record<TimerConfig["kind"], FieldDef[]> = {
  regresiva: [{ key: "totalSec", label: "Minutos", step: 60, min: 60, max: 5400, time: true }],
  amrap: [
    { key: "blockSec", label: "Tiempo por bloque", step: 30, min: 30, max: 3600, time: true },
    { key: "blocks", label: "Bloques", step: 1, min: 1, max: 10 },
    { key: "restSec", label: "Descanso", step: 15, min: 0, max: 600, time: true },
  ],
  emom: [
    { key: "everySec", label: "Cada", step: 15, min: 15, max: 600, time: true },
    { key: "rounds", label: "Rondas", step: 1, min: 1, max: 60 },
  ],
  tabata: [
    { key: "workSec", label: "Trabajo", step: 5, min: 5, max: 300, time: true },
    { key: "restSec", label: "Descanso", step: 5, min: 0, max: 300, time: true },
    { key: "rounds", label: "Rondas", step: 1, min: 1, max: 30 },
  ],
  fortime: [{ key: "capSec", label: "Time cap", step: 60, min: 60, max: 5400, time: true }],
};
const MODES: { kind: TimerConfig["kind"]; name: string; hint: string }[] = [
  { kind: "regresiva", name: "REGRESIVA", hint: "Ej: 15 min" },
  { kind: "amrap", name: "AMRAP / BLOQUES", hint: "Bloques + descanso" },
  { kind: "emom", name: "EMOM", hint: "Cada X, N rondas" },
  { kind: "tabata", name: "TABATA", hint: "Trabajo / descanso" },
  { kind: "fortime", name: "FOR TIME", hint: "Sube hasta el cap" },
];

function Editor({ initial, isNew, onSave, onCancel }: { initial: TimerState; isNew: boolean; onSave: (t: TimerState, launch: boolean) => void; onCancel: () => void }) {
  const [d, setD] = useState<TimerState>(initial);
  const cfg = d.config as unknown as Record<string, number>;
  const total = totalSec(buildPhases(d.config, d.precount));
  const step = (f: FieldDef, dir: number) => setD({ ...d, config: { ...d.config, [f.key]: Math.max(f.min, Math.min(f.max, cfg[f.key] + dir * f.step)) } as TimerConfig });

  return (
    <Shell>
      <div className="flex items-center gap-2">
        <button type="button" aria-label="Volver" onClick={onCancel} className="-ml-1 grid size-11 place-items-center">
          <Icon d="M15 6l-6 6 6 6" />
        </button>
        <span className={`${cond} text-[26px] font-black tracking-[1px]`}>{isNew ? "NUEVO TIMER" : "EDITAR TIMER"}</span>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className={label}>Nombre</span>
        <input value={d.name} onChange={(e) => setD({ ...d, name: e.target.value.slice(0, 14).toUpperCase() })} className="h-12 rounded-xl border border-line bg-panel px-3.5 text-[17px] font-semibold" />
      </label>

      <div className="flex flex-col gap-2">
        <span className={label}>Color</span>
        <div className="flex gap-2.5">
          {COLORS.map((c) => (
            <button key={c.id} type="button" aria-label={c.label} aria-pressed={d.color === c.hex} onClick={() => setD({ ...d, color: c.hex })} className="size-12 rounded-full" style={{ background: c.hex, border: `4px solid ${d.color === c.hex ? "#fff" : "transparent"}` }} />
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className={label}>Modo</span>
        <div className="grid grid-cols-2 gap-2">
          {MODES.map((m) => {
            const on = d.config.kind === m.kind;
            return (
              <button key={m.kind} type="button" aria-pressed={on} onClick={() => setD({ ...d, config: defaultConfig(m.kind) })} className="flex min-h-14 flex-col items-start justify-center rounded-xl border px-3 py-2 text-left" style={{ background: on ? d.color : "var(--panel)", color: on ? "#07080B" : "#fff", borderColor: on ? d.color : "var(--line)" }}>
                <span className={`${cond} text-xl font-black tracking-[1px]`}>{m.name}</span>
                <span className="text-xs font-semibold opacity-80">{m.hint}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col rounded-2xl border border-line bg-panel">
        {FIELDS[d.config.kind].map((f) => (
          <div key={f.key} className="flex items-center justify-between border-b border-line py-2 pr-2.5 pl-3.5">
            <span className="text-[15px] font-semibold">{f.label}</span>
            <div className="flex items-center gap-1.5">
              <button type="button" aria-label={`Restar ${f.label}`} onClick={() => step(f, -1)} className="grid size-11 place-items-center rounded-[10px] bg-line"><Icon d="M5 12h14" size={18} /></button>
              <span className={`${cond} min-w-16 text-center text-[28px] font-black tabular-nums`}>{f.time ? fmtShort(cfg[f.key]) : cfg[f.key]}</span>
              <button type="button" aria-label={`Sumar ${f.label}`} onClick={() => step(f, 1)} className="grid size-11 place-items-center rounded-[10px] bg-line"><Icon d="M12 5v14M5 12h14" size={18} /></button>
            </div>
          </div>
        ))}
        <button type="button" aria-pressed={d.precount} onClick={() => setD({ ...d, precount: !d.precount })} className="flex min-h-14 items-center justify-between px-3.5">
          <span className="text-[15px] font-semibold">Cuenta previa 10 s</span>
          <span className="flex h-7 w-12 items-center rounded-full p-[3px]" style={{ background: d.precount ? d.color : "#2E323C", justifyContent: d.precount ? "flex-end" : "flex-start" }}>
            <span className="size-[22px] rounded-full bg-white" />
          </span>
        </button>
      </div>

      <div className="flex items-baseline justify-between px-0.5">
        <span className="text-sm font-semibold text-muted">{describe(d.config)}</span>
        <span className={`${cond} text-[30px] font-black tabular-nums`} style={{ color: d.color }}>{fmt(total * 1000, true)}</span>
      </div>

      <div className="flex-1" />
      <div className="sticky bottom-0 flex gap-2 bg-bg pt-2 pb-4">
        <button type="button" onClick={() => onSave(d, false)} className={`${cond} h-14 rounded-2xl border border-line bg-panel px-5 text-lg font-extrabold tracking-[2px]`}>GUARDAR</button>
        <button type="button" onClick={() => onSave(d, true)} className={`${cond} h-14 flex-1 rounded-2xl text-[19px] font-black tracking-[2px] text-[#07080B]`} style={{ background: d.color }}>
          MANDAR A LA TELE
        </button>
      </div>
    </Shell>
  );
}

// ---------- Piezas chicas ----------
function Shell({ children }: { children: ReactNode }) {
  return <main className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-1 flex-col gap-5 px-[18px] pt-5 pb-6">{children}</main>;
}
function Pill({ ok, text }: { ok: boolean; text: string }) {
  return (
    <span className="flex items-center gap-2 rounded-full border border-line bg-panel px-3 py-1.5 text-[13px] font-semibold whitespace-nowrap">
      <span className="size-2 rounded-full" style={{ background: ok ? "#D4FF00" : "#FF6B1A" }} />
      {text}
    </span>
  );
}
function Icon({ d, size = 22 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}
function IconBtn({ aria, d, onClick }: { aria: string; d: string; onClick: () => void }) {
  return (
    <button type="button" aria-label={aria} onClick={onClick} className="grid size-11 place-items-center rounded-xl bg-line">
      <Icon d={d} size={18} />
    </button>
  );
}
function RoundBtn({ aria, onClick, children }: { aria: string; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" aria-label={aria} onClick={onClick} className={`${cond} size-16 rounded-full border border-line bg-panel text-xl font-extrabold`}>
      {children}
    </button>
  );
}
function Action({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className={`${cond} h-14 rounded-2xl border border-line bg-panel text-[17px] font-extrabold tracking-[2px]`}>
      {children}
    </button>
  );
}


function LinkField({ id, title, hint, value, copied, onCopy }: { id: string; title: string; hint: string; value: string; copied: boolean; onCopy: () => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className={label}>{title}</label>
      <p className="text-[13px] text-muted">{hint}</p>
      <div className="flex gap-2">
        <input id={id} readOnly value={value} onFocus={(e) => e.currentTarget.select()} className="h-11 min-w-0 flex-1 rounded-xl border border-line bg-bg px-3 text-[13px]" />
        <button type="button" onClick={onCopy} className={`${cond} h-11 rounded-xl bg-line px-4 text-[15px] font-extrabold tracking-[2px]`}>
          {copied ? "COPIADO" : "COPIAR"}
        </button>
      </div>
    </div>
  );
}
