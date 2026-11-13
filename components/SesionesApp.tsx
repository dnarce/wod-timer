"use client";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Brand } from "./TvApp";
import { Qr } from "./Qr";

type Row = { id: string; name: string; phones: number; tvs: number; controlPath: string };
type Phase = "loading" | "login" | "ready" | "unconfigured";

const cond = "font-cond";
const lbl = `${cond} text-[15px] font-bold tracking-[3px] text-muted uppercase`;

export default function SesionesApp() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null); // sesión con el QR de control abierto
  const [confirm, setConfirm] = useState<string | null>(null); // sesión que se está por cerrar
  const [pw, setPw] = useState("");
  const [bad, setBad] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const busy = useRef(false);

  // Una consulta a la vez: Ably sólo permite una enumeración de canales en curso.
  const load = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      const r = await fetch("/api/admin/sessions", { cache: "no-store" });
      if (r.status === 401) return setPhase("login");
      if (r.status === 503) return setPhase("unconfigured");
      if (!r.ok) throw new Error(String(r.status));
      const j = (await r.json()) as { screens: Row[] };
      setRows(j.screens);
      setError(null);
      setPhase("ready");
    } catch {
      setError("No pude leer las pantallas de Ably. Reintento solo en unos segundos.");
    } finally {
      busy.current = false;
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial al montar: los setState ocurren después del fetch
    void load();
    // Cada consulta con detalle mantiene "vivos" los canales en Ably: se hace pocas veces y sólo con la pestaña visible.
    const t = setInterval(() => {
      if (!document.hidden) void load();
    }, 30_000);
    const onVisible = () => {
      if (!document.hidden) void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  const login = async () => {
    setBad(false);
    const r = await fetch("/api/admin/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: pw }) });
    if (r.ok) {
      setPw("");
      setPhase("loading");
      void load();
    } else if (r.status === 503) setPhase("unconfigured");
    else setBad(true);
  };

  const logout = async () => {
    await fetch("/api/admin/logout", { method: "POST" });
    setRows([]);
    setPhase("login");
  };

  const close = async (id: string) => {
    setConfirm(null);
    const r = await fetch("/api/admin/close", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    if (!r.ok) return setError("No pude cerrar la sesión. Probá de nuevo.");
    setOpen(null);
    setNotice("Sesión cerrada: la tele vuelve al QR y los celulares se desvinculan.");
    setTimeout(() => void load(), 3000);
    setTimeout(() => setNotice(null), 12_000);
  };

  const copy = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      (document.getElementById(`link-${id}`) as HTMLInputElement | null)?.select(); // sin HTTPS: queda seleccionado
    }
  };

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-1 flex-col gap-6 px-5 pt-8 pb-10">
      <header className="flex items-center justify-between gap-4">
        <Brand size={30} />
        {phase === "ready" && (
          <button type="button" onClick={() => void logout()} className={`${cond} h-10 rounded-xl border border-line px-4 text-[15px] font-extrabold tracking-[2px]`}>
            SALIR
          </button>
        )}
      </header>

      {phase === "loading" && <p className="text-muted">Cargando…</p>}

      {phase === "unconfigured" && (
        <Notice title="FALTA LA CONTRASEÑA DE ADMINISTRADOR">
          Definí la variable <code>ADMIN_PASSWORD</code> en el servidor (en local, en <code>.env.local</code>) y reiniciá.
        </Notice>
      )}

      {phase === "login" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void login();
          }}
          className="flex max-w-sm flex-col gap-3"
        >
          <h1 className={`${cond} text-[32px] leading-none font-black tracking-[1px]`}>SESIONES</h1>
          <label htmlFor="admin-pw" className={lbl}>Contraseña de administrador</label>
          <input id="admin-pw" type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} className="h-12 rounded-xl border border-line bg-panel px-3.5 text-[16px]" />
          {bad && (
            <p role="alert" className="text-[14px] font-semibold text-[#FF3D8B]">
              Contraseña incorrecta.
            </p>
          )}
          <button type="submit" className={`${cond} h-14 rounded-2xl bg-volt text-[19px] font-black tracking-[2px] text-[#07080B]`}>
            ENTRAR
          </button>
        </form>
      )}

      {phase === "ready" && (
        <>
          <div className="flex items-center justify-between gap-3">
            <h1 className={`${cond} text-[32px] leading-none font-black tracking-[1px]`}>PANTALLAS</h1>
            <button type="button" onClick={() => void load()} className={`${cond} h-10 rounded-xl border border-line px-4 text-[15px] font-extrabold tracking-[2px]`}>
              ACTUALIZAR
            </button>
          </div>
          <p className="text-[13px] text-muted">Son las pantallas de la variable PANTALLAS. Se actualiza sola cada 30 s.</p>
          {notice && (
            <p role="status" className="rounded-xl border border-line bg-panel p-3 text-[14px] font-semibold">
              {notice}
            </p>
          )}
          {error && (
            <p role="alert" className="text-[14px] font-semibold text-[#FF6B1A]">
              {error}
            </p>
          )}
          {rows.length === 0 && <p className="rounded-2xl border border-dashed border-line p-6 text-center text-muted">No hay pantallas cargadas aún.</p>}

          {rows.map((s) => {
            const link = `${location.origin}${s.controlPath}`;
            const shown = open === s.id;
            return (
              <section key={s.id} className="flex flex-col gap-3 rounded-2xl border border-line bg-panel p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-col">
                    <span className={`${cond} text-2xl font-black tracking-[1px] uppercase`}>{s.name}</span>
                  </div>
                  <span className="flex items-center gap-2 text-sm font-semibold">
                    <span className="size-2 rounded-full" style={{ background: s.tvs > 0 ? "#D4FF00" : "#FF6B1A" }} />
                    {s.tvs > 0 ? "Tele conectada" : "Tele apagada"} · {s.phones} {s.phones === 1 ? "celular" : "celulares"}
                  </span>
                </div>

                {confirm === s.id ? (
                  <div className="flex flex-col gap-2 rounded-xl border border-line p-3">
                    <span className="text-[15px] font-semibold">¿Cerrar la sesión? La tele vuelve al QR y los celulares se desvinculan. Se pierden los timers.</span>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setConfirm(null)} className="h-11 flex-1 rounded-xl border border-line font-bold">Cancelar</button>
                      <button type="button" onClick={() => void close(s.id)} className="h-11 flex-1 rounded-xl bg-[#FF3D8B] font-extrabold text-[#07080B]">Cerrar sesión</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <button type="button" aria-expanded={shown} onClick={() => setOpen(shown ? null : s.id)} className={`${cond} h-11 flex-1 rounded-xl bg-line text-[16px] font-extrabold tracking-[2px]`}>
                      {shown ? "OCULTAR CONTROL" : "CONTROLAR"}
                    </button>
                    <button type="button" onClick={() => setConfirm(s.id)} className={`${cond} h-11 rounded-xl border border-line px-4 text-[16px] font-extrabold tracking-[2px]`}>
                      CERRAR
                    </button>
                  </div>
                )}

                {shown && (
                  <div className="flex flex-wrap items-center gap-4 rounded-xl border border-line bg-bg p-3">
                    <div className="rounded-lg bg-white p-2">
                      <Qr text={link} size={168} />
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col gap-2">
                      <p className="text-[13px] text-muted">Escaneá este QR con tu celular, o abrí el link: tomás el control de esta tele.</p>
                      <input id={`link-${s.id}`} readOnly value={link} onFocus={(e) => e.currentTarget.select()} aria-label="Link de control" className="h-11 min-w-0 rounded-xl border border-line bg-panel px-3 text-[13px]" />
                      <div className="flex gap-2">
                        <a href={s.controlPath} className={`${cond} grid h-11 flex-1 place-items-center rounded-xl bg-volt text-[16px] font-black tracking-[2px] text-[#07080B]`}>
                          ABRIR AQUÍ
                        </a>
                        <button type="button" onClick={() => void copy(s.id, link)} className={`${cond} h-11 rounded-xl bg-line px-4 text-[16px] font-extrabold tracking-[2px]`}>
                          {copied === s.id ? "COPIADO" : "COPIAR"}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </section>
            );
          })}
        </>
      )}
    </main>
  );
}

function Notice({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-line bg-panel p-5">
      <h1 className={`${cond} text-[26px] leading-none font-black tracking-[1px]`}>{title}</h1>
      <p className="text-[15px] text-muted">{children}</p>
    </div>
  );
}
