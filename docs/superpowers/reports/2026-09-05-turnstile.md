# Cloudflare Turnstile en el formulario de contacto — 5 de septiembre de 2026

> **Contexto:** el endpoint `/api/contact` (ver
> [`2026-09-05-auditoria-produccion.md`](./2026-09-05-auditoria-produccion.md))
> ya tenía un campo trampa (honeypot) y un límite de 5 envíos por IP cada 10
> minutos. Turnstile es una capa adicional, opcional por diseño desde el
> primer commit del endpoint: se activa automáticamente en cuanto existe la
> variable de entorno `TURNSTILE_SECRET_KEY`, sin más cambios de código. Este
> documento registra su activación.

## Qué se hizo

- **Widget:** creado en el panel de Cloudflare (Turnstile → Add widget
  manually), nombre "Formulario de contacto clcolor.com", hostname
  `clcolor.com`, modo **Managed** (Cloudflare decide si mostrar un desafío
  visible según el riesgo del visitante), sin Pre-clearance.
- **Site Key** (pública, ya escrita en `script.js`): `0x4AAAAAAEphAHkLhJU95ppR`
- **Secret Key**: guardada como Secret en Cloudflare Pages → `clc-studio-design`
  → Settings → Variables and secrets → Production → `TURNSTILE_SECRET_KEY`.
  Nunca vive en el repositorio.
- **Render explícito** (`render=explicit&onload=onTurnstileLoad` en el script
  de `index.html`): el widget se inicializa desde `script.js` vía
  `turnstile.render()`, lo que permite leer el token con un callback propio y
  resetear el widget después de cada intento de envío (los tokens de
  Turnstile son de un solo uso).
- **CSP actualizada** (`_headers`): `script-src`, `frame-src` y `connect-src`
  incluyen `https://challenges.cloudflare.com`, siguiendo la recomendación
  oficial de Cloudflare (`developers.cloudflare.com/turnstile/reference/content-security-policy`).

## Verificación

No es posible resolver un widget real de Turnstile por `curl` — requiere un
navegador de verdad. Lo que sí se verificó, con el runtime real de Cloudflare
Pages (`wrangler pages dev`) y las **claves oficiales de prueba de
Cloudflare** (documentadas en
`developers.cloudflare.com/turnstile/troubleshooting/testing`):

| Escenario | Secret usada | Resultado |
|---|---|---|
| Sin `turnstile_token` en el payload | (cualquiera) | `403` — rechazado antes de llamar a Cloudflare |
| Token cualquiera, secreto "siempre acepta" (`1x0000...AA`) | prueba | `200` — envió un correo real a `contacto@clcolor.com` |
| Token cualquiera, secreto "siempre rechaza" (`2x0000...AA`) | prueba | `403` |
| Token inventado, **secreto real de producción** | real | `403` — el secreto real rechaza tokens falsos, a diferencia del de prueba |

Este último caso es la prueba clave: confirma que la Secret Key real está
bien configurada y que `verificarTurnstile()` llama correctamente a
`https://challenges.cloudflare.com/turnstile/v0/siteverify` y respeta su
respuesta. El único tramo no probado por herramienta automática es que un
**token real, generado por el widget en un navegador real, sea aceptado** —
eso solo se confirma visitando el sitio y enviando el formulario de verdad
tras el despliegue.

## Pendiente tras el despliegue

1. Visitar `https://clcolor.com/#contacto` en un navegador real, confirmar
   que el widget aparece antes del botón "Enviar", y que un envío normal
   entrega el correo con éxito.
2. Si en el futuro Cloudflare marca visitantes legítimos con demasiada
   frecuencia, se puede cambiar el modo del widget de **Managed** a
   **Non-interactive** desde el panel de Turnstile, sin tocar código.
