# Diseño: Despliegue de CLC Studio Design en Cloudflare

## Contexto

El sitio (`Proyecto_CLC_Ver_1.07`) es hoy 100% estático: HTML/CSS/JS plano, sin
build tool, sin backend, ~115MB principalmente en imágenes y video bajo
`recursos/`. Ya existe un repo en GitHub (`JAAG2021/clc-studio-design`) con un
solo commit. El formulario de contacto en `index.html` usa
`action="mailto:..."`, que no es confiable como mecanismo de envío real.

Objetivo: publicar el sitio en producción con un dominio propio, presupuesto
menor a $10/mes, uso comercial (es un estudio de diseño real), y dejar la
puerta abierta a que el sitio escale en dos direcciones: más tráfico, y
funcionalidad dinámica (formulario de contacto que funcione de verdad, y más
adelante un panel para publicar noticias/proyectos sin tocar código).

## Decisión de arquitectura

Todo el stack vive en **Cloudflare** (un solo vendor, un solo panel):

```
Usuario → Cloudflare Pages (sitio estático)
              ├─ Cloudflare Function /api/contact → Resend (envío de email)
              └─ [Fase 2] Cloudflare Function /api/cms + D1 (BD) + R2 (assets)
Cloudflare Registrar/DNS → dominio nuevo
Cloudflare Email Routing → contacto@<dominio> reenviado a Gmail existente
```

### Alternativas consideradas y descartadas

- **VPS propio (Hetzner/DigitalOcean) + Docker + Caddy**: opción inicial,
  daría práctica de administración de servidor Linux, pero el usuario
  finalmente prefirió cero mantenimiento de servidor y ya tiene experiencia
  desplegando en PaaS (Railway, Vercel, Cloudflare). Descartada.
- **Vercel**: su plan gratuito ("Hobby") está limitado a uso no comercial
  según sus términos; un sitio comercial real requeriría el plan Pro
  ($20/mes), lo que rompe el presupuesto. Su ventaja principal (DX de
  frameworks como Next.js) tampoco aplica aquí porque el sitio es HTML plano.
  Descartada.
- **Cloudflare Pages (estático) + Railway (backend/CMS)**: viable, backend
  con modelo de servidor tradicional (Node/Postgres) en vez de funciones
  edge, pero introduce un segundo vendor y costo variable (~$5-10/mes) donde
  Cloudflare solo puede cubrir el mismo alcance a $0/mes. Descartada a favor
  de la opción todo-Cloudflare.

## Componentes

### 1. Dominio y DNS

- Registrar el dominio nuevo vía **Cloudflare Registrar** (precio "at-cost",
  sin margen) si el TLD elegido está soportado (`.com` sí). Si se prefiere un
  TLD no soportado por Cloudflare Registrar (p. ej. `.studio`, `.design`),
  registrar en Namecheap/Porkbun y apuntar el DNS a Cloudflare de todas
  formas.
- DNS gestionado 100% en Cloudflare (proxy activado para CDN/SSL/DDoS).

### 2. Correo profesional

- **Cloudflare Email Routing** (gratis): reenvía `contacto@<dominio>` (u
  otras direcciones) al Gmail actual (`cleanlinecolorstudio@gmail.com`), sin
  necesidad de Google Workspace de pago.

### 3. Sitio estático — Cloudflare Pages

- Conectar el repo `JAAG2021/clc-studio-design` a Cloudflare Pages
  (integración nativa con GitHub).
- Sin build step: el output es el propio contenido del repo (HTML/CSS/JS
  plano).
- Cada `push` a `main` despliega a producción automáticamente. Cada Pull
  Request genera una URL de preview.
- Verificado: el archivo más pesado en `recursos/` es un GIF de 15MB — muy
  por debajo del límite de Cloudflare Pages de 25 MiB por archivo. No hay
  bloqueo técnico para subir el contenido actual tal cual.
- Corrección tras revisar las referencias en el código (durante la
  elaboración del plan de implementación): `recursos/Galería de la
  sección/Video 3.gif` (15MB) no está enlazado desde ningún HTML/JS/CSS del
  proyecto — es un archivo huérfano; la galería ya usa `Video-3.mp4`
  (860KB). La mejora recomendada (no bloqueante) es eliminarlo, no
  convertirlo.

### 4. Formulario de contacto — Cloudflare Functions + Resend

- Reemplazar `action="mailto:..."` en `index.html` por un `fetch()` desde
  `script.js` hacia una Cloudflare Function propia
  (`/functions/api/contact.js`).
- La Function valida los campos recibidos y envía el correo vía **Resend**
  (free tier: 3,000 emails/mes, suficiente para el volumen esperado) a la
  dirección de contacto del dominio (o al Gmail actual mientras se configura
  el correo del dominio).
- La API key de Resend se guarda como secret de Cloudflare Pages, nunca en
  el repo.

### 5. Fase 2 (futura, no bloqueante para el lanzamiento) — CMS ligero

- Cuando haga falta publicar noticias/proyectos sin editar HTML a mano:
  - **Cloudflare D1** (SQLite serverless) para los registros de
    noticias/proyectos.
  - **Cloudflare R2** para las imágenes subidas desde el panel.
  - Una Cloudflare Function protegida con autenticación simple sirve el
    panel de administración y las páginas dinámicas resultantes.
- Esta fase se diseña e implementa por separado cuando exista la necesidad
  real; la arquitectura de Fase 1 no requiere cambios para acomodarla.

### 6. Seguridad y monitoreo

- SSL/TLS automático, WAF básico y protección DDoS: incluidos por defecto en
  Cloudflare al proxear el dominio.
- **Cloudflare Web Analytics** (gratis, sin cookies) para métricas de
  tráfico, evitando depender de Google Analytics.

## Costos estimados

| Partida | Costo |
|---|---|
| Dominio | ~$10-15/año (~$1/mes) |
| Cloudflare Pages | $0/mes (free tier) |
| Cloudflare Functions | $0/mes (free tier, 100k req/día) |
| Resend (email) | $0/mes (free tier, 3,000 emails/mes) |
| Cloudflare Email Routing | $0/mes |
| **Total** | **~$1/mes**, muy por debajo del presupuesto de $10/mes |

Margen amplio para crecer hacia D1/R2 (Fase 2) sin salir de free tiers en el
corto/mediano plazo.

## Fuera de alcance de este spec

- Implementación del panel de CMS de Fase 2 (se especifica cuando se
  necesite).
- Rediseño de contenido o UX del sitio existente.
- Migración de contenido/optimización de medios más allá del GIF señalado
  arriba.
