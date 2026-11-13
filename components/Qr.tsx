"use client";
import { useEffect, useState } from "react";
import QRCode from "qrcode";

export function Qr({ text, size, dark = "#07080B" }: { text: string; size: number; dark?: string }) {
  const [svg, setSvg] = useState("");
  useEffect(() => {
    let live = true;
    QRCode.toString(text, { type: "svg", margin: 0, errorCorrectionLevel: "M", color: { dark, light: "#FFFFFF" } }).then((s) => live && setSvg(s));
    return () => {
      live = false;
    };
  }, [text, dark]);
  return (
    <div
      role="img"
      aria-label="Código QR para controlar la pantalla"
      style={{ width: size, height: size, lineHeight: 0 }}
      // SVG generado localmente por la librería qrcode a partir de nuestra propia URL.
      dangerouslySetInnerHTML={{ __html: svg.replace("<svg ", `<svg width="${size}" height="${size}" `) }}
    />
  );
}
