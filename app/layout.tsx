import type { Metadata, Viewport } from "next";
import { Saira, Saira_Condensed } from "next/font/google";
import "./globals.css";

const saira = Saira({ variable: "--font-saira", subsets: ["latin"], weight: ["400", "500", "600", "700"] });
const sairaCond = Saira_Condensed({
  variable: "--font-saira-cond",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800", "900"],
});

export const metadata: Metadata = {
  title: "WOD TV Timer",
  description: "Timers de gimnasio en la tele, controlados desde el celular del profe.",
};

export const viewport: Viewport = { themeColor: "#07080B", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={`${saira.variable} ${sairaCond.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
