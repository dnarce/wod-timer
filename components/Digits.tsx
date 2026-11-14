// Números con ancho fijo por carácter. La tipografía (Saira Condensed) no trae cifras tabulares: el "1" mide 2/3 del "8",
// así que con `tabular-nums` los relojes se movían en cada segundo. Cada cifra va en su propio casillero del mismo ancho.
// Los anchos salen de medir la fuente: la cifra más ancha ("8") mide 0,494 em y los dos puntos 0,277 em.
const DIGIT_EM = 0.48;
const COLON_EM = 0.27;

export function Digits({ text }: { text: string }) {
  return (
    <span role="img" aria-label={text} style={{ display: "inline-flex", letterSpacing: 0, whiteSpace: "pre" }}>
      {[...text].map((c, i) => (
        <span key={i} aria-hidden="true" style={{ display: "inline-block", width: `${c === ":" ? COLON_EM : DIGIT_EM}em`, textAlign: "center" }}>
          {c}
        </span>
      ))}
    </span>
  );
}
