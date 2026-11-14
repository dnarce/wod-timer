import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { SoundTestButton } from "@/components/SoundTestButton";
import { Brand } from "@/components/TvApp";
import { parseScreens, screenLabel } from "@/lib/screens";

// Inicio: no crea ninguna sesión. Lista las pantallas de la variable PANTALLAS para elegir una.
async function Screens() {
  await connection(); // la variable se lee en cada pedido, no al compilar
  const screens = parseScreens(process.env.PANTALLAS);
  if (!screens.length) {
    return <p className="m-0 text-xl font-semibold text-[#9CA1AD]">No hay pantallas cargadas aún.</p>;
  }
  return (
    <details className="w-full max-w-sm">
      <summary className="flex h-14 cursor-pointer list-none items-center justify-center rounded-2xl bg-[#D4FF00] text-lg font-extrabold text-[#07080B] [&::-webkit-details-marker]:hidden">
        Elegir pantalla
      </summary>
      <ul className="m-0 mt-3 flex list-none flex-col gap-2 p-0">
        {screens.map((s) => (
          <li key={s}>
            <Link href={`/${s}`} className="flex min-h-12 items-center rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-lg font-bold text-white capitalize no-underline">
              {screenLabel(s)}
            </Link>
          </li>
        ))}
      </ul>
    </details>
  );
}

export default function Home() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-10 bg-[#07080B] px-4 py-10 text-white">
      <Brand size={44} />
      <div className="flex w-full max-w-sm flex-col gap-3">
        <Suspense>
          <Screens />
        </Suspense>
        <SoundTestButton />
      </div>
    </main>
  );
}
