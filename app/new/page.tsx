import type { Metadata } from "next";
import NewSession from "@/components/NewSession";

export const metadata: Metadata = { title: "WOD TV Timer · Nueva sesión" };

// Página de inicio para el navegador de la tele: crea una sesión limpia y muestra el QR.
export default function New() {
  return <NewSession />;
}
