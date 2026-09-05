# Auditoría de producción — 5 de septiembre de 2026

> **Contexto:** Cloudflare notificó a los dueños que `clcolor.com` superó 10.000
> visitas en el último mes, pero los dueños de CLC no habían recibido ningún
> contacto por el formulario, y la URL "no se encontraba" al escribirla
> directamente en el navegador. Este documento registra la auditoría contra
> producción, los 14 hallazgos, y todo lo que se corrigió — tanto en el
> código (rama `fix/auditoria-produccion`) como en el panel de Cloudflare
> (que no deja rastro en git).

## Resumen

- **14 hallazgos** verificados contra `https://clcolor.com` en producción.
- **14 de 14 corregidos.** 11 en código (9 commits en `fix/auditoria-produccion`
  sobre `dae4b4c`), 3 solo posibles desde el panel de Cloudflare.
- **Cadena de contacto verificada de punta a punta**, con envíos reales
  entregados en `contacto@clcolor.com`.

## Hallazgos y su corrección

| # | Hallazgo | Dónde se corrigió |
|---|---|---|
| 1 | `www.clcolor.com` daba error 522 (dominio "no se encontraba") | Panel — Redirect Rule |
| 2 | El botón "Enviar" nunca se habilitaba si faltaban Empresa o Teléfono | Código — `bc6e802` |
| 3 | Soft 404: cualquier URL inexistente devolvía el home con estado 200 | Código — `1eef3a5` (`404.html`) |
| 4 | El loader de 4s no arrancaba hasta descargar 28 MB del home | Código — `1eef3a5` |
| 5 | Sin canonical, Open Graph, Twitter Card ni favicon en ninguna página | Código — `bc58cb4` |
| 6 | Las 9 fichas de proyecto compartían título/descripción (contenido duplicado) | Código — `bc58cb4` |
| 7 | Todo el sitemap apuntaba a URLs `.html` que redirigen 308 | Código — `bc58cb4` |
| 8 | Archivos internos del repo publicados en el dominio (`docs/`, `pnpm-lock.yaml`...) | Código — `c407891` (`.assetsignore` no sirve en Pages; se usó `_middleware.js` + `_routes.json`) |
| 9 | Un envío que fallaba en Resend se perdía sin dejar rastro | Código — `bc58cb4`, `886509a` |
| 10 | `/api/contact` sin honeypot ni límite de envíos | Código — `bc58cb4` |
| 11 | 109 `<img>` sin `loading="lazy"` ni dimensiones; imágenes/video sin comprimir (28,5 MB → 3,4 MB) | Código — `1be8cdc` |
| 12 | Sin HSTS, CSP, X-Frame-Options ni Permissions-Policy | Código — `c407891` (`_headers`) |
| 13 | Sin JavaScript, el home quedaba tapado por el loader (contenido en `opacity:0`) | Código — `68b5fe2` |
| 14 | Dos `<h1>` en el home | Código — `bc58cb4` |

**Hallazgo adicional, fuera de la auditoría original:** el destinatario real
del formulario **nunca fue `contacto@clcolor.com`** — el código apuntaba a un
Gmail personal y a una dirección de pruebas. Corregido junto con el hallazgo 2.

## Pasos manuales hechos en el panel de Cloudflare

Estos **no están en git** — son configuración de plataforma, no cambios en el
repositorio (mismo criterio que el resto de la documentación de despliegue de
este proyecto).

### 1. Variables de entorno — proyecto `clc-studio-design` → Settings → Variables and secrets → Production

| Variable | Valor final |
|---|---|
| `CONTACT_FROM_EMAIL` | `CleanLineColor Studio <formulario@mail.clcolor.com>` |
| `CONTACT_TO_EMAIL` | `contacto@clcolor.com` |
| `RESEND_API_KEY` | (sin cambios; ya era correcta) |

`CONTACT_TO_EMAIL` y el dominio de `CONTACT_FROM_EMAIL` **ya estaban
correctos** antes de esta sesión — solo faltaba el nombre para mostrar. La
suposición inicial de que producción apuntaba a un correo equivocado era
incorrecta; el problema real de "cero contactos" era el hallazgo 2 (botón
bloqueado), confirmado por el contador de *Worker invocations: 0* que mostró
el propio dashboard antes de esta corrección.

### 2. Redirect Rule — dominio `clcolor.com` → Rules → Overview → plantilla "Redirect from WWW to root"

- **Rule name:** `www a apex`
- **Request URL (wildcard):** `https://www.*`
- **Target URL:** `https://${1}`
- **Status code:** 301
- **Preserve query string:** activado

Verificado en vivo: `https://www.clcolor.com/proyecto?proyecto=surf-city` →
`301` → `https://clcolor.com/proyecto?proyecto=surf-city` (con query string
intacto).

### 3. KV namespace — Storage & databases → Workers KV → `CONTACTOS`

Enlazado en `clc-studio-design` → Settings → Bindings → KV namespace,
variable `CONTACTOS`, entorno Production. Con este binding activo, cada
envío del formulario queda guardado en KV **antes** de llamar a Resend (así
un fallo de Resend ya no pierde el contacto sin rastro), y se aplica un
límite de 5 envíos por IP cada 10 minutos.

## Verificación end-to-end

Todo probado contra el runtime real de Cloudflare Pages (`wrangler pages dev`)
antes de tocar producción, y contra producción después de los pasos del
panel:

- **4 envíos reales** por el formulario completo (validación → honeypot →
  Function → Resend), incluido el caso exacto que producción bloqueaba (sin
  empresa ni teléfono). Los 4 entregados, confirmados en la bandeja de
  `contacto@clcolor.com`.
- `GET /api/contact` → `405`; `POST` inválido → `400`; `POST` con el campo
  trampa relleno → `200` sin enviar correo.
- Las 9 rutas privadas (`docs/`, `test/`, `package.json`...) → `404`.
- Los 84 recursos referenciados por las 6 páginas → `200`, tras normalizar
  todas las rutas a raíz.
- `https://www.clcolor.com/` → `301` → `https://clcolor.com/`, verificado en
  producción tras desplegar la Redirect Rule.

## Pendiente después de fusionar esta rama

1. **Desplegar `fix/auditoria-produccion` a producción** (merge a `main`,
   rama de producción en Cloudflare Pages — despliegue automático).
2. Repetir un envío real del formulario ya en producción, para confirmar que
   `CONTACT_FROM_EMAIL` con el nombre nuevo llega bien.
3. Reenviar `sitemap.xml` en Google Search Console y pedir reindexación del
   home (el soft 404 histórico pudo haber afectado la indexación).
4. Opcional: crear una clave de Cloudflare Turnstile y guardarla como
   `TURNSTILE_SECRET_KEY` — el endpoint la exige automáticamente en cuanto
   existe, sin más cambios de código.

## Referencias

- Auditoría publicada (informe visual): ver enlace compartido en la
  conversación original — 14 hallazgos con evidencia, capturas y plan de
  acción.
- Plan de despliegue original: [`2026-07-19-cloudflare-deployment.md`](../plans/2026-07-19-cloudflare-deployment.md)
- Spec de diseño original: [`2026-07-19-cloudflare-deployment-design.md`](../specs/2026-07-19-cloudflare-deployment-design.md)
