"use client";
import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

export const THEMES = {
  noche: { bg: "#07080B", panel: "#12141A", line: "#23262F", fg: "#FFFFFF", muted: "#9CA1AD", track: "#1B1E25", rest: "#E6EBF5", screen: "#0C0E13" },
  dia: { bg: "#EEF0F3", panel: "#FFFFFF", line: "#DFE2E8", fg: "#07080B", muted: "#565B66", track: "#E7E9EE", rest: "#5B6475", screen: "#F3F4F6" },
} as const;
/** `rest` es el color de TODOS los descansos (números, etiqueta, barra), sea cual sea el color del timer: nunca coincide con la paleta de timers. */
export type ThemeTokens = (typeof THEMES)[keyof typeof THEMES];

export const COND = "var(--font-saira-cond), 'Arial Narrow', sans-serif";

/** Escenario fijo de 1920×1080 que se escala para llenar cualquier pantalla. */
export function Stage({ theme, children }: { theme: keyof typeof THEMES; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const fit = () => setScale(Math.min(window.innerWidth / 1920, window.innerHeight / 1080));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);
  const t = THEMES[theme];
  const outer: CSSProperties = { position: "fixed", inset: 0, background: t.bg, overflow: "hidden" };
  const inner: CSSProperties = {
    position: "absolute",
    left: "50%",
    top: "50%",
    width: 1920,
    height: 1080,
    transform: `translate(-50%, -50%) scale(${scale})`,
    background: t.bg,
    color: t.fg,
    overflow: "hidden",
  };
  return (
    <div style={outer}>
      <div ref={ref} style={inner}>
        {children}
      </div>
    </div>
  );
}
