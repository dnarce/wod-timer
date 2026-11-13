import type { Metadata } from "next";
import SesionesApp from "@/components/SesionesApp";

export const metadata: Metadata = { title: "WOD TV Timer · Sesiones", robots: { index: false, follow: false } };

// Pantalla de recepción: sesiones activas, con acceso al control y cierre. Pide contraseña de administrador.
export default function Sesiones() {
  return <SesionesApp />;
}
