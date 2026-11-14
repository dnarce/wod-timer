"use client";

import { useEffect, useRef, useState } from "react";
import { beep, cancelBeeps, unlockAudio } from "@/lib/beep";

export function SoundTestButton() {
  const [error, setError] = useState(false);
  const test = useRef({ attempt: 0 });

  useEffect(() => {
    const current = test.current;
    void unlockAudio();
    return () => {
      current.attempt++;
      cancelBeeps("tv-test");
    };
  }, []);

  function testSound() {
    const current = test.current;
    const attempt = ++current.attempt;
    void unlockAudio().then((ok) => {
      if (attempt !== current.attempt) return;
      setError(!ok);
      if (ok) {
        cancelBeeps("tv-test");
        beep(0, "tv-test");
      }
    });
  }

  return (
    <>
      <button
        type="button"
        className="min-h-14 cursor-pointer rounded-2xl border border-white/15 bg-white/5 px-4 text-lg font-bold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D4FF00]"
        onClick={testSound}
        onKeyDown={(event) => {
          if (event.key !== "Enter" && event.keyCode !== 13) return;
          event.preventDefault();
          if (!event.repeat) testSound();
        }}
      >
        Probar sonido
      </button>
      {error && <p role="status" className="text-center text-sm text-[#9CA1AD]">El navegador no pudo activar el audio.</p>}
    </>
  );
}
