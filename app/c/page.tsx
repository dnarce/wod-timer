import type { Metadata } from "next";
import ControlApp from "@/components/ControlApp";

export const metadata: Metadata = { title: "WOD TV Timer · Control" };

// El celular entra desde el QR: /c#<sesión>.<llave>. La llave va en el hash, así no llega a ningún log.
export default function Control() {
  return <ControlApp />;
}
