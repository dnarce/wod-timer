import { Suspense } from "react";
import TvApp from "@/components/TvApp";

// Link fijo de una tele: /carrodilla. El nombre tiene que estar en la variable PANTALLAS (lo verifica /api/pantalla).
async function Screen({ params }: { params: Promise<{ pantalla: string }> }) {
  const { pantalla } = await params;
  return <TvApp screen={decodeURIComponent(pantalla).toLowerCase()} />;
}

export default function Page({ params }: { params: Promise<{ pantalla: string }> }) {
  return (
    <Suspense>
      <Screen params={params} />
    </Suspense>
  );
}
