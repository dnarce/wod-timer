# WOD TV Timer

Timers de gimnasio para la tele, controlados desde el celular del profe.

- **`/`** — la tele. Muestra un QR hasta que un celular se vincula; después, la planificación del día
  (iframe de [inca-planning](https://incafitnessclub.github.io/inca-planning/)) o los timers (1 a 3).
  Tocar la pantalla (o una tecla del control remoto) muestra u oculta el QR en cualquier modo.
- **`/new`** — página de inicio recomendada para el navegador de la tele: crea una sesión limpia y redirige a
  su URL permanente (`/#<sesión>.<llave>`), así un refresco no la pierde. `/new?nombre=Sala 1` le pone nombre.
- **`/c`** — el celular. Se abre desde el QR (`/c#<sesión>.<llave>`), elegís qué mostrar y manejás hasta 3 timers:
  regresiva, AMRAP/bloques, EMOM, Tabata y For Time. La llave **queda en la URL**: guardar ese link como favorito
  o en la pantalla de inicio recupera el control sin escanear. Si el celular perdió su acceso, se puede pegar el link.
- **`/sesiones`** — pantalla de recepción (pide `ADMIN_PASSWORD`): lista las sesiones activas, abre el control de
  cualquiera (QR o link), **renombrarlas** y cerrarlas.

## Cómo funciona

El celular es la fuente de verdad: publica el estado completo (timers, vista, tema) y la tele sólo lo dibuja.
Los tiempos son marcas de la hora del servidor, no ticks: la tele calcula el reloj sola y sigue andando aunque se corte la conexión.
Celular y tele se sincronizan con `/api/sync`, así que no importa si sus relojes difieren.

**Sonido:** la tele no emite sonido. Los beeps (últimos 3 s de cada tramo, arranque y fin) suenan en el celular del profe, junto a su música; se activan o apagan en *Más opciones*.

La llave del QR es un HMAC del id de sesión: el servidor no guarda nada y la tele sólo puede escuchar.

## Sesión de la tele y cambio de profe

- **Link fijo de la tele:** la tele guarda su sesión en la URL (`/#<sesión>.<llave>`). Desde el celular, en
  *Más opciones → Link fijo de la tele*, se copia ese link: guardarlo como favorito en el navegador de la tele
  evita perder la sesión aunque el navegador borre los datos.
- **Un solo profe manda a la vez.** El último celular que escanea el QR toma el control y hereda los timers en curso;
  el anterior pasa solo a "Otro celular tomó el control" (con *Retomar el control* o *Salir*).
- **Cerrar sesión** (Más opciones): suelta el control, borra los timers y la tele vuelve al QR. Los celulares que ya
  estaban desvinculados también se despiden.
- La tele sólo escucha; el control se coordina con el campo `controller` del estado compartido (`lib/session.ts`).
  No es una barrera de seguridad: quien tenga el QR tiene la llave.

## Configuración

Copiá `.env.example` a `.env.local` y completá:

| Variable | Para qué |
| --- | --- |
| `ABLY_API_KEY` | Tiempo real. Obligatoria en Vercel (serverless no sostiene conexiones largas). |
| `SESSION_SECRET` | Firma las llaves de control. Obligatoria en Vercel. |
| `ADMIN_PASSWORD` | Contraseña de `/sesiones`. Sin ella, esa pantalla avisa que falta configurarla. |

> **SDK de Ably:** las cuentas nuevas cobran por MAU y exigen el SDK v3 (`@ably/pubsub-device`).
> El paquete `ably` de npm (2.x) es rechazado con el error 40168. El servidor firma el token (JWT) a mano
> con `lib/server/ably-jwt.ts`, así que no usa ningún SDK de Ably.

En Ably: creá la app, una API key con `subscribe`, `publish` y `history`, y en **Settings → Channel rules** una regla
para el namespace `wod` con **Persist last message** activado. Así la tele recupera el último estado al reiniciarse
aunque el celular esté apagado.

Sin `ABLY_API_KEY`, en local (`npm run dev`) usa un bus en memoria con SSE, sólo para desarrollo.
En Vercel sin la variable muestra un error en vez de fallar en silencio.

## Desarrollo

```bash
npm install
npm run dev     # http://localhost:3000
npm test        # motor de timers
```

El motor está en `lib/engine.ts` (funciones puras) y el estado compartido en `lib/state.ts`.

## Sesiones: qué pasa por dentro

- Una sesión es un id aleatorio (con el nombre adelante si lo tiene) y su canal `wod:<id>` en Ably. El servidor no guarda nada.
- Nada las borra: Ably no elimina canales ni su último mensaje. Dejan de aparecer en `/sesiones` cuando nadie está conectado.
- `/sesiones` lista **sólo canales activos** (Ably no enumera los inactivos): una tele apagada no se ve.
- **El nombre vive en la tele**, no en el id: la tele lo guarda en su navegador y lo anuncia por **presencia** de Ably
  (`{ role: "tv", name }`); `/sesiones` lo lee de ahí. "Renombrar" manda una orden `rename` a la tele, que lo guarda y
  actualiza su presencia. Como el nombre es de la tele, sobrevive cuando la sesión se reinicia. Si la tele está apagada
  la sesión no aparece (Ably no la lista), así que tampoco se puede renombrar.
- "Cerrar" publica un estado `closed`: la tele pide una sesión nueva (con el mismo nombre) y los celulares se despiden.
- Si en la regla de canal `wod:*` está tildado **Identification required**, los pedidos REST del servidor se identifican
  con un `clientId` (`lib/server/ably-rest.ts`).

## Pendiente

- Rate limit en `/api/session` y `/api/realtime/token`.
- El QR chico de la esquina se oculta a los 30 s; tocar la pantalla lo muestra o lo oculta.
