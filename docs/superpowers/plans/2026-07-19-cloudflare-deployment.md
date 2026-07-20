# Despliegue de CLC Studio Design en Cloudflare — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publicar `Proyecto_CLC_Ver_1.07` en producción sobre Cloudflare Pages con un dominio propio, un formulario de contacto que envía correo real (reemplazando el `mailto:` actual), y las piezas de plataforma (DNS, correo, analítica) configuradas — todo dentro de Cloudflare, bajo $10/mes.

**Architecture:** Sitio estático servido por Cloudflare Pages desde el repo `JAAG2021/clc-studio-design` (sin build step). El formulario de contacto pasa de `action="mailto:"` a un `fetch()` hacia una Cloudflare Pages Function (`/functions/api/contact.js`) que valida los datos y envía el correo vía la API de Resend. Dominio, DNS, y correo profesional (Email Routing) también viven en Cloudflare.

**Tech Stack:** HTML/CSS/JS estático (sin cambios), Cloudflare Pages, Cloudflare Pages Functions (runtime Workers), Node.js + `wrangler` (solo como herramienta local de desarrollo/pruebas, no en producción), Resend (envío de email), `node:test` (pruebas unitarias de la validación).

## Global Constraints

- Presupuesto: menor a $10/mes (estimado real ~$1/mes, solo el dominio).
- Uso comercial permitido en todos los servicios elegidos (por esto se descartó el free tier de Vercel).
- Todo el stack de plataforma vive en Cloudflare: Pages, Functions, Registrar/DNS, Email Routing. (D1/R2 quedan reservados para una Fase 2 de CMS, fuera de alcance de este plan.)
- El sitio permanece estático, sin build step (HTML/CSS/JS plano tal como existe hoy).
- Límite de Cloudflare Pages: 25 MiB por archivo. Ya verificado: el archivo más pesado en `recursos/` es un GIF de 15MB, dentro del límite.
- Resend free tier: 3,000 emails/mes — suficiente para el volumen esperado del formulario de contacto.
- No se implementa la Fase 2 (CMS con D1/R2) en este plan.

---

### Task 1: Bootstrap de herramientas locales (Node + wrangler)

**Files:**
- Create: `package.json`
- Modify: `.gitignore`

**Interfaces:**
- Produces: script `npm test` (corre `node --test test/`), script `npm run dev` (corre `wrangler pages dev .`), ambos usados por las Tasks 2 y 3.

- [ ] **Step 1: Crear `package.json`**

```json
{
  "name": "clc-studio-design",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test test/",
    "dev": "wrangler pages dev ."
  },
  "devDependencies": {}
}
```

- [ ] **Step 2: Instalar wrangler como devDependency**

Run: `npm install --save-dev wrangler`
Expected: crea `node_modules/`, `package-lock.json`, y agrega `wrangler` a `devDependencies` en `package.json`.

- [ ] **Step 3: Actualizar `.gitignore`**

Agregar al final del archivo existente:

```
.wrangler/
.dev.vars
```

(`node_modules/` ya está ignorado desde antes.)

- [ ] **Step 4: Verificar que wrangler quedó instalado**

Run: `npx wrangler --version`
Expected: imprime un número de versión (ej. `⛅️ wrangler 3.x.x` o `4.x.x`), sin errores.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json .gitignore
git commit -m "chore: bootstrap Node tooling for local Cloudflare Pages dev"
```

---

### Task 2: Lógica de validación del formulario de contacto (TDD)

**Files:**
- Create: `functions/api/_validate.js`
- Test: `test/validate.test.js`

**Interfaces:**
- Consumes: nada (función pura).
- Produces: `validateContactPayload(payload)` → `{ valid: boolean, errors: Record<string, string> }`. Usada por Task 3 (`functions/api/contact.js`).

- [ ] **Step 1: Escribir el test que falla**

Crear `test/validate.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateContactPayload } from '../functions/api/_validate.js';

test('un payload completo y válido pasa', () => {
  const result = validateContactPayload({
    nombre_apellido: 'Ana Pérez',
    empresa: 'Acme',
    telefono: '555-1234',
    email: 'ana@example.com',
    mensaje: 'Hola, quiero cotizar un proyecto.'
  });
  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, {});
});

test('falta el nombre', () => {
  const result = validateContactPayload({
    nombre_apellido: '',
    email: 'ana@example.com',
    mensaje: 'Hola'
  });
  assert.equal(result.valid, false);
  assert.equal(result.errors.nombre_apellido, 'Requerido.');
});

test('email con formato inválido', () => {
  const result = validateContactPayload({
    nombre_apellido: 'Ana Pérez',
    email: 'no-es-un-email',
    mensaje: 'Hola'
  });
  assert.equal(result.valid, false);
  assert.equal(result.errors.email, 'Formato de email inválido.');
});

test('falta el mensaje', () => {
  const result = validateContactPayload({
    nombre_apellido: 'Ana Pérez',
    email: 'ana@example.com',
    mensaje: ''
  });
  assert.equal(result.valid, false);
  assert.equal(result.errors.mensaje, 'Requerido.');
});

test('payload nulo se rechaza sin lanzar', () => {
  const result = validateContactPayload(null);
  assert.equal(result.valid, false);
});
```

- [ ] **Step 2: Ejecutar el test y confirmar que falla**

Run: `npm test`
Expected: FAIL — `Cannot find module '../functions/api/_validate.js'` (el archivo aún no existe).

- [ ] **Step 3: Implementar `functions/api/_validate.js`**

```js
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateContactPayload(payload) {
  const errors = {};

  if (!payload || typeof payload !== 'object') {
    return { valid: false, errors: { _: 'Payload ausente.' } };
  }

  const nombre = typeof payload.nombre_apellido === 'string' ? payload.nombre_apellido.trim() : '';
  const email = typeof payload.email === 'string' ? payload.email.trim() : '';
  const mensaje = typeof payload.mensaje === 'string' ? payload.mensaje.trim() : '';

  if (nombre.length === 0) {
    errors.nombre_apellido = 'Requerido.';
  }

  if (email.length === 0) {
    errors.email = 'Requerido.';
  } else if (!EMAIL_RE.test(email)) {
    errors.email = 'Formato de email inválido.';
  }

  if (mensaje.length === 0) {
    errors.mensaje = 'Requerido.';
  }

  return { valid: Object.keys(errors).length === 0, errors };
}
```

- [ ] **Step 4: Ejecutar el test y confirmar que pasa**

Run: `npm test`
Expected: PASS — 5 tests, 0 fallos.

- [ ] **Step 5: Commit**

```bash
git add functions/api/_validate.js test/validate.test.js
git commit -m "feat: add pure validation for contact form payload"
```

---

### Task 3: Cloudflare Pages Function `/api/contact`

**Files:**
- Create: `functions/api/contact.js`
- Create: `.dev.vars.example`

**Interfaces:**
- Consumes: `validateContactPayload` de `functions/api/_validate.js` (Task 2).
- Produces: endpoint `POST /api/contact`. Body de entrada: `{ nombre_apellido, empresa, telefono, email, mensaje }` (JSON). Respuestas: `200 { ok: true }`, `400 { ok: false, error, fields? }`, `502 { ok: false, error }`. Usado por Task 4 (`script.js`).

- [ ] **Step 1: Crear cuenta en Resend y obtener API key**

Ir a https://resend.com, crear cuenta (puede usarse el Gmail actual del negocio), y generar una API key desde el dashboard (Settings → API Keys). Guardarla temporalmente — se usa en el paso siguiente y en la Task 6.

- [ ] **Step 2: Documentar las variables de entorno requeridas**

Crear `.dev.vars.example` (plantilla versionada, sin secretos reales):

```
RESEND_API_KEY=re_xxxxxxxxxxxx
CONTACT_FROM_EMAIL=onboarding@resend.dev
CONTACT_TO_EMAIL=cleanlinecolorstudio@gmail.com
```

- [ ] **Step 3: Crear el archivo local de secretos (no versionado)**

Copiar la plantilla y rellenar con la API key real:

```bash
cp .dev.vars.example .dev.vars
```

Editar `.dev.vars` y reemplazar `re_xxxxxxxxxxxx` por la API key real de Resend. `CONTACT_FROM_EMAIL` queda como `onboarding@resend.dev` (remitente de pruebas de Resend, válido sin verificar dominio propio) y `CONTACT_TO_EMAIL` como el correo donde quieres recibir los mensajes.

- [ ] **Step 4: Implementar `functions/api/contact.js`**

```js
import { validateContactPayload } from './_validate.js';

export async function onRequestPost(context) {
  const { request, env } = context;

  let payload;
  try {
    payload = await request.json();
  } catch (err) {
    return jsonResponse({ ok: false, error: 'JSON inválido.' }, 400);
  }

  const { valid, errors } = validateContactPayload(payload);
  if (!valid) {
    return jsonResponse({ ok: false, error: 'Datos inválidos.', fields: errors }, 400);
  }

  const { nombre_apellido, empresa, telefono, email, mensaje } = payload;

  const emailBody = [
    `Nombre y apellido: ${nombre_apellido}`,
    `Empresa: ${empresa || '(no especificada)'}`,
    `Teléfono: ${telefono || '(no especificado)'}`,
    `Email: ${email}`,
    '',
    mensaje
  ].join('\n');

  const resendResponse = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: env.CONTACT_FROM_EMAIL,
      to: env.CONTACT_TO_EMAIL,
      reply_to: email,
      subject: `Nuevo contacto de ${nombre_apellido}`,
      text: emailBody
    })
  });

  if (!resendResponse.ok) {
    return jsonResponse({ ok: false, error: 'No se pudo enviar el mensaje. Intenta de nuevo.' }, 502);
  }

  return jsonResponse({ ok: true }, 200);
}

function jsonResponse(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}
```

- [ ] **Step 5: Levantar el entorno local y verificar el endpoint manualmente**

Run: `npm run dev`
Expected: arranca un servidor local (por defecto `http://127.0.0.1:8788`) sirviendo el sitio estático y las Functions.

En otra terminal, con el servidor corriendo:

```bash
curl -i -X POST http://127.0.0.1:8788/api/contact \
  -H "Content-Type: application/json" \
  -d '{"nombre_apellido":"Ana Pérez","empresa":"Acme","telefono":"555-1234","email":"ana@example.com","mensaje":"Prueba de integración"}'
```

Expected: `HTTP/1.1 200 OK` con body `{"ok":true}`, y un correo real recibido en la bandeja configurada en `CONTACT_TO_EMAIL` en un par de minutos.

También verificar el caso inválido:

```bash
curl -i -X POST http://127.0.0.1:8788/api/contact \
  -H "Content-Type: application/json" \
  -d '{"nombre_apellido":"","email":"no-es-un-email","mensaje":""}'
```

Expected: `HTTP/1.1 400 Bad Request` con `fields` listando `nombre_apellido`, `email`, `mensaje`.

- [ ] **Step 6: Commit**

```bash
git add functions/api/contact.js .dev.vars.example
git commit -m "feat: add Cloudflare Pages Function for contact form email delivery"
```

(`.dev.vars` no se agrega — está en `.gitignore` desde la Task 1.)

---

### Task 4: Reemplazar el `mailto:` del formulario por la Function

**Files:**
- Modify: `index.html:355`
- Modify: `script.js:219-254`
- Modify: `style.css` (después de la regla `.contact-submit:not(:disabled):hover`, línea 870)

**Interfaces:**
- Consumes: `POST /api/contact` (Task 3) — mismo contrato de request/response.

- [ ] **Step 1: Quitar el envío por `mailto:` del formulario**

En `index.html`, reemplazar:

```html
<form class="contact-form" action="mailto:cleanlinecolorstudio@gmail.com" method="post" enctype="text/plain"
  accept-charset="UTF-8">
```

por:

```html
<form class="contact-form" id="contact-form">
```

- [ ] **Step 2: Agregar el elemento de estado del formulario**

En `index.html`, justo después de:

```html
<button class="contact-submit" type="submit" disabled aria-disabled="true">Enviar</button>
```

agregar:

```html
<p id="contact-status" class="contact-status" role="status" aria-live="polite"></p>
```

- [ ] **Step 3: Reemplazar la lógica de `script.js`**

En `script.js`, reemplazar el bloque completo `initContactFormValidation` (líneas 219-254) por:

```js
/* Contact form: completeness guard + submission via Cloudflare Function */
(function initContactForm() {
  const form = document.querySelector('.contact-form');
  if (!form) return;

  const fields = Array.from(form.querySelectorAll('input, textarea'));
  const submitButton = form.querySelector('.contact-submit');
  const statusEl = document.getElementById('contact-status');
  if (!submitButton || fields.length === 0) return;

  const isFormComplete = () => fields.every((field) => field.value.trim().length > 0);

  function updateSubmitState() {
    const complete = isFormComplete();
    submitButton.disabled = !complete;
    submitButton.setAttribute('aria-disabled', String(!complete));
  }

  function setStatus(message, isError) {
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.classList.toggle('contact-status--error', Boolean(isError));
  }

  fields.forEach((field) => {
    field.addEventListener('input', updateSubmitState);
    field.addEventListener('change', updateSubmitState);
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    updateSubmitState();

    if (!isFormComplete()) {
      const firstEmptyField = fields.find((field) => field.value.trim().length === 0);
      firstEmptyField?.focus();
      return;
    }

    const payload = {
      nombre_apellido: form.querySelector('#contact-name').value.trim(),
      empresa: form.querySelector('#contact-company').value.trim(),
      telefono: form.querySelector('#contact-phone').value.trim(),
      email: form.querySelector('#contact-email').value.trim(),
      mensaje: form.querySelector('#contact-message').value.trim()
    };

    submitButton.disabled = true;
    setStatus('Enviando...', false);

    fetch('/api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then((response) => response.json().then((data) => ({ ok: response.ok, data })))
      .then(({ ok, data }) => {
        if (!ok || !data.ok) {
          throw new Error(data?.error || 'No se pudo enviar el mensaje.');
        }
        setStatus('¡Mensaje enviado! Te contactaremos pronto.', false);
        form.reset();
      })
      .catch((error) => {
        setStatus(error.message, true);
      })
      .finally(() => {
        updateSubmitState();
      });
  });

  window.addEventListener('pageshow', updateSubmitState);
  setTimeout(updateSubmitState, 100);
  updateSubmitState();
})();
```

- [ ] **Step 4: Agregar estilos mínimos para el mensaje de estado**

En `style.css`, después de la regla `.contact-submit:not(:disabled):hover` (línea 870), agregar:

```css
.contact-status {
  margin-top: 12px;
  font-size: 14px;
  color: #4d5ac4;
}

.contact-status--error {
  color: #c0392b;
}
```

- [ ] **Step 5: Verificar manualmente en el navegador**

Con `npm run dev` corriendo (Task 3), abrir `http://127.0.0.1:8788/index.html`, ir a la sección de contacto, llenar todos los campos y enviar.
Expected: el botón se deshabilita brevemente, aparece "Enviando...", luego "¡Mensaje enviado! Te contactaremos pronto." en color de acento, el formulario se limpia, y llega el correo a la bandeja configurada.

Repetir dejando el campo de email con un valor inválido antes de completar el resto — Expected: al enviar aparece el mensaje de error en rojo y el formulario no se limpia.

- [ ] **Step 6: Correr los tests unitarios para confirmar que no se rompió nada**

Run: `npm test`
Expected: PASS — los 5 tests de la Task 2 siguen pasando (no se tocó `_validate.js`).

- [ ] **Step 7: Commit**

```bash
git add index.html script.js style.css
git commit -m "feat: submit contact form to /api/contact instead of mailto:"
```

---

### Task 5: Conectar el repo a Cloudflare Pages y desplegar

**Files:** ninguno (configuración en el dashboard de Cloudflare).

- [ ] **Step 1: Crear el proyecto en Cloudflare Pages**

En el dashboard de Cloudflare → Workers & Pages → Create → Pages → Connect to Git, seleccionar el repo `JAAG2021/clc-studio-design`.

- [ ] **Step 2: Configurar el build**

En la pantalla de configuración del proyecto:
- Framework preset: `None`
- Build command: (dejar vacío)
- Build output directory: `/`

- [ ] **Step 3: Configurar las variables de entorno de producción**

En el mismo asistente (o después, en Settings → Environment variables → Production), agregar:
- `RESEND_API_KEY` (marcar como **Encrypted**) — la misma API key de la Task 3.
- `CONTACT_FROM_EMAIL` = `onboarding@resend.dev` (se actualizará en la Task 8 al verificar el dominio propio en Resend).
- `CONTACT_TO_EMAIL` = `cleanlinecolorstudio@gmail.com`

- [ ] **Step 4: Desplegar**

Guardar y desplegar. Cloudflare Pages construye y publica el sitio en una URL del tipo `https://clc-studio-design.pages.dev`.

- [ ] **Step 5: Verificar el sitio y el endpoint en producción**

```bash
curl -sI https://clc-studio-design.pages.dev/ | head -1
```

Expected: `HTTP/2 200`

```bash
curl -i -X POST https://clc-studio-design.pages.dev/api/contact \
  -H "Content-Type: application/json" \
  -d '{"nombre_apellido":"Prueba Producción","email":"ana@example.com","mensaje":"Verificación post-deploy"}'
```

Expected: `200 OK` con `{"ok":true}` y correo recibido en `CONTACT_TO_EMAIL`.

No se hace commit en este task — es configuración de plataforma, no cambios en el repo.

---

### Task 6: Registrar el dominio y configurar DNS en Cloudflare

**Files:** ninguno.

- [ ] **Step 1: Elegir y registrar el dominio**

Desde el dashboard de Cloudflare → Domain Registration → Register a Domain, buscar el dominio deseado (ej. `clcstudiodesign.com`). Si el TLD no está soportado por Cloudflare Registrar (p. ej. `.studio`, `.design`), registrarlo en Namecheap o Porkbun y luego agregar el sitio a Cloudflare (Add a Site) para delegar el DNS, actualizando los nameservers en el registrador externo según lo que indique Cloudflare.

- [ ] **Step 2: Verificar que el dominio quedó activo en Cloudflare**

Run: `dig NS <tu-dominio> +short`
Expected: dos nameservers con el patrón `*.ns.cloudflare.com`.

---

### Task 7: Conectar el dominio personalizado a Cloudflare Pages

**Files:** ninguno.

- [ ] **Step 1: Agregar el dominio personalizado al proyecto de Pages**

En el proyecto de Pages (Task 5) → Custom domains → Set up a custom domain → escribir `<tu-dominio>` (y opcionalmente `www.<tu-dominio>`). Cloudflare crea el registro DNS automáticamente porque el dominio ya vive en la misma cuenta.

- [ ] **Step 2: Verificar HTTPS y contenido en el dominio final**

Run: `curl -sI https://<tu-dominio>/ | head -1`
Expected: `HTTP/2 200`

Run: `curl -s https://<tu-dominio>/ | grep -o '<title>[^<]*</title>'`
Expected: imprime el `<title>` real de `index.html`, confirmando que sirve el contenido correcto (no una página de error/placeholder).

---

### Task 8: Verificar dominio de envío en Resend y pasar a remitente de producción

**Files:** ninguno.

- [ ] **Step 1: Agregar el dominio en Resend**

En el dashboard de Resend → Domains → Add Domain → `<tu-dominio>`. Resend muestra registros DNS (SPF, DKIM, y opcionalmente DMARC) a agregar.

- [ ] **Step 2: Agregar los registros DNS en Cloudflare**

En el dashboard de Cloudflare del dominio → DNS → Records, agregar exactamente los registros TXT/CNAME que mostró Resend en el paso anterior.

- [ ] **Step 3: Confirmar la verificación**

En Resend → Domains, esperar a que el estado del dominio cambie a "Verified" (puede tardar algunos minutos por propagación DNS).

- [ ] **Step 4: Actualizar la variable de entorno de producción**

En Cloudflare Pages → Settings → Environment variables → Production, cambiar `CONTACT_FROM_EMAIL` de `onboarding@resend.dev` a algo como `contacto@<tu-dominio>`. Volver a desplegar (Retry deployment o un nuevo push) para que la Function tome el nuevo valor.

- [ ] **Step 5: Verificar el envío con el remitente definitivo**

Repetir la verificación de la Task 5 Step 5 (POST a `/api/contact` en producción) y confirmar que el correo recibido ahora muestra como remitente `contacto@<tu-dominio>` en vez de `onboarding@resend.dev`.

---

### Task 9: Configurar Cloudflare Email Routing (correo profesional)

**Files:** ninguno.

- [ ] **Step 1: Activar Email Routing**

En el dashboard de Cloudflare del dominio → Email → Email Routing → Enable. Cloudflare agrega automáticamente los registros MX necesarios (si el dominio ya está proxeado por Cloudflare, esto es automático).

- [ ] **Step 2: Crear la regla de reenvío**

Routing rules → Create address → dirección personalizada `contacto@<tu-dominio>` → Destination: el Gmail existente (`cleanlinecolorstudio@gmail.com`). Confirmar el destino desde el correo de verificación que Cloudflare envía a esa bandeja.

- [ ] **Step 3: Verificar el reenvío**

Enviar un correo de prueba a `contacto@<tu-dominio>` desde cualquier cuenta externa.
Expected: el correo llega a `cleanlinecolorstudio@gmail.com` en menos de un par de minutos.

---

### Task 10: Activar Cloudflare Web Analytics

**Files:** ninguno (configuración de plataforma; no requiere editar HTML porque el dominio ya está proxeado por Cloudflare).

- [ ] **Step 1: Activar Web Analytics para el dominio**

Dashboard de Cloudflare → Analytics & Logs → Web Analytics → Add a site → seleccionar `<tu-dominio>` → Automatic setup (inyección automática del beacon en las respuestas HTML del dominio proxeado; no requiere tocar el código del sitio).

- [ ] **Step 2: Verificar que hay datos**

Visitar `https://<tu-dominio>/` un par de veces desde el navegador, esperar 1-2 minutos, y revisar el dashboard de Web Analytics del sitio.
Expected: aparecen al menos las visitas generadas manualmente (page views > 0).

---

### Task 11 (opcional, no bloqueante): Eliminar el GIF de 15MB que no se usa

Se verificó durante la revisión del plan que `recursos/Galería de la sección/Video 3.gif` (15MB) no está referenciado desde ningún `.html`, `.js` ni `.css` del proyecto — la versión que sí se usa en la galería es `Video-3.mp4` (860KB, ya en uso en `index.html`). Es un archivo huérfano que solo pesa el repo y el deploy.

**Files:**
- Delete: `recursos/Galería de la sección/Video 3.gif`

- [ ] **Step 1: Confirmar que sigue sin referencias antes de borrar**

Run (desde la raíz del repo):

```bash
grep -rln "Video 3.gif" --include=*.html --include=*.js --include=*.css .
```

Expected: sin salida (ningún archivo lo referencia). Si en el futuro este comando sí devuelve resultados, no continuar con el Step 2 sin antes actualizar esas referencias.

- [ ] **Step 2: Eliminar el archivo**

```bash
git rm "recursos/Galería de la sección/Video 3.gif"
```

- [ ] **Step 3: Verificar que el sitio sigue funcionando igual**

Con `npm run dev` corriendo, abrir la página de inicio y confirmar que la galería de videos se ve y reproduce igual que antes (el archivo eliminado no se usaba).

- [ ] **Step 4: Commit**

```bash
git commit -m "chore: remove unused 15MB gallery GIF"
```

---

## Resumen de despliegue

Al completar las Tasks 1-10, el sitio queda en producción en `https://<tu-dominio>` servido por Cloudflare Pages, con HTTPS/CDN/WAF automáticos, el formulario de contacto enviando correo real vía Resend, un correo profesional (`contacto@<tu-dominio>`) reenviando a Gmail, y analítica básica activa — todo por ~$1/mes (solo el dominio). La Task 11 es una mejora de rendimiento opcional. La Fase 2 (panel de CMS con D1/R2 para noticias/proyectos) queda fuera de este plan, para especificarse por separado cuando exista la necesidad real.
