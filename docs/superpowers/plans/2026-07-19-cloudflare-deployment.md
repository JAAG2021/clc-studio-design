# Despliegue de CLC Studio Design en Cloudflare — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publicar `Proyecto_CLC_Ver_1.07` en producción sobre Cloudflare Pages con un dominio propio, un formulario de contacto que envía correo real (reemplazando el `mailto:` actual), y las piezas de plataforma (DNS, correo, analítica) configuradas — todo dentro de Cloudflare, bajo $10/mes.

**Architecture:** Sitio estático servido por Cloudflare Pages desde el repo `JAAG2021/clc-studio-design` (sin build step). El formulario de contacto pasa de `action="mailto:"` a un `fetch()` hacia una Cloudflare Pages Function (`/functions/api/contact.js`) que valida los datos y envía el correo vía la API de Resend. El dominio `clcolor.com` se compra en Hostinger (junto con un buzón real, Hostinger Business Email, para `contacto@clcolor.com`), pero el DNS se delega a Cloudflare para conservar Pages, Web Analytics y la verificación de dominio en Resend.

**Tech Stack:** HTML/CSS/JS estático (sin cambios), Cloudflare Pages, Cloudflare Pages Functions (runtime Workers), Node.js + `wrangler` (solo como herramienta local de desarrollo/pruebas, no en producción), Resend (envío de email), `node:test` (pruebas unitarias de la validación).

## Global Constraints

- Presupuesto: menor a $10/mes (estimado real ~$1.50-2/mes: dominio + buzón de Hostinger Business Email).
- Uso comercial permitido en todos los servicios elegidos (por esto se descartó el free tier de Vercel).
- Dominio (`clcolor.com`) y correo (`contacto@clcolor.com`) se compran en Hostinger — decisión posterior al spec original: Cloudflare Email Routing solo reenvía correo entrante, no permite *enviar* como `contacto@clcolor.com`, y el negocio necesita responder a clientes con remitente corporativo real. El resto de la plataforma (Pages, Functions, DNS) sigue en Cloudflare: el DNS de `clcolor.com` se delega a Cloudflare aunque el dominio se haya comprado en Hostinger. (D1/R2 quedan reservados para una Fase 2 de CMS, fuera de alcance de este plan.)
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
- Produces: script `ppnpm test` (corre `node --test test/`), script `ppnpm run dev` (corre `wrangler pages dev .`), ambos usados por las Tasks 2 y 3. (Nota: este proyecto usa `pnpm`, no `npm`, por convención del entorno.)

- [ ] **Step 1: Crear `package.json`**

```json
{
  "name": "clc-studio-design",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test",
    "dev": "wrangler pages dev ."
  },
  "devDependencies": {}
}
```

(Nota: `node --test test/` con la ruta explícita falla en Node 24.13.1 con
un `MODULE_NOT_FOUND` espurio al intentar resolver `test/` como módulo CJS.
`node --test` sin argumentos usa el auto-discovery nativo y sí encuentra
`test/*.test.js` correctamente — por eso el script queda así.)

- [ ] **Step 2: Instalar wrangler como devDependency**

Run: `pnpm add -D wrangler`
Expected: crea `node_modules/`, `pnpm-lock.yaml`, y agrega `wrangler` a `devDependencies` en `package.json`. Si pnpm reporta scripts de instalación bloqueados (`ERR_PNPM_IGNORED_BUILDS`) para `esbuild`/`sharp`/`workerd`, correr `pnpm approve-builds --all` — son dependencias legítimas de `wrangler`.

- [ ] **Step 3: Actualizar `.gitignore`**

Agregar al final del archivo existente:

```
.wrangler/
.dev.vars
```

(`node_modules/` ya está ignorado desde antes.)

- [ ] **Step 4: Verificar que wrangler quedó instalado**

Run: `pnpm exec wrangler --version`
Expected: imprime un número de versión (ej. `4.x.x`), sin errores.

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-lock.yaml pnpm-workspace.yaml .gitignore
git commit -m "chore: bootstrap Node tooling for local Cloudflare Pages dev"
```

(`pnpm-workspace.yaml` aparece porque `pnpm approve-builds` registra ahí los paquetes con permiso para correr scripts de instalación — se versiona para que una instalación limpia en otra máquina no vuelva a bloquear esos scripts.)

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

Run: `pnpm test`
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

Run: `pnpm test`
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

Editar `.dev.vars` y reemplazar `re_xxxxxxxxxxxx` por la API key real de Resend. `CONTACT_FROM_EMAIL` queda como `onboarding@resend.dev` (remitente de pruebas de Resend, válido sin verificar dominio propio).

**Importante sobre `CONTACT_TO_EMAIL` mientras se use el remitente de pruebas**: Resend solo permite enviar, desde `onboarding@resend.dev`, a la dirección de correo **con la que se creó la cuenta de Resend** — no a cualquier destinatario. Si `CONTACT_TO_EMAIL` apunta a otra dirección, la API de Resend responde `403 validation_error` (nuestra Function lo traduce a `502`). Por lo tanto, hasta que se complete la Task 8 (verificar `clcolor.com` en Resend), `CONTACT_TO_EMAIL` debe ser el correo con el que se registró la cuenta de Resend — tanto en `.dev.vars` local como en la variable de producción de Cloudflare Pages (Task 5 Step 3). Una vez verificado el dominio propio (Task 8), esta restricción desaparece y `CONTACT_TO_EMAIL` puede ser cualquier dirección real.

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

Run: `pnpm run dev`
Expected: arranca un servidor local (por defecto `http://127.0.0.1:8788`) sirviendo el sitio estático y las Functions.

**Si la máquina no tiene conectividad IPv6 funcional** (común en algunas redes/VPN), el `fetch()` de la Function hacia `api.resend.com` puede quedarse colgado indefinidamente sin error — `api.resend.com` resuelve a Cloudflare, que sí publica registros AAAA, y `workerd` (el runtime local de Cloudflare Pages) no hace fallback rápido a IPv4 si el intento por IPv6 no responde. Si el `curl` de verificación de más abajo se cuelga sin devolver nada (a diferencia de un error rápido), reinicia el servidor local así:

```bash
NODE_OPTIONS="--dns-result-order=ipv4first" pnpm run dev
```

Esto fuerza a Node a preferir direcciones IPv4 al resolver DNS, evitando el intento de conexión por IPv6 que se cuelga. Si el `fetch` colgado ya dejó un proceso `workerd` huérfano ocupando el puerto 8788 (visible con `Get-NetTCPConnection -LocalPort 8788` en PowerShell), termínalo con `Stop-Process -Id <PID> -Force` antes de reiniciar.

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
- Modify: `index.html:355` (form), `index.html` (campo de teléfono), `index.html` (script tags al final del `<body>`)
- Modify: `script.js:219-254`
- Modify: `style.css` (después de la regla `.contact-submit:not(:disabled):hover`)
- Create: `vendor/libphonenumber-min.js` (copiado del paquete npm, ver Step 4)
- Modify: `package.json`, `pnpm-lock.yaml` (dependencia `libphonenumber-js`, usada solo para generar el bundle de navegador — no se importa en runtime del sitio ni en la Function)

**Interfaces:**
- Consumes: `POST /api/contact` (Task 3) — mismo contrato de request/response.
- Consumes: global `window.libphonenumber` (expuesto por `vendor/libphonenumber-min.js`) — funciones `getCountries()`, `getCountryCallingCode(country)`, `isValidPhoneNumber(input, country)`, `parsePhoneNumberFromString(input, country)`.

Durante la implementación surgieron dos ajustes no previstos en el diseño original, ambos por retroalimentación directa del usuario probando el formulario:
1. **Validación de formato de email en el cliente** (no solo en el servidor) — feedback inmediato sin esperar la red.
2. **Validación de teléfono por país** con selector de país + `libphonenumber-js`, en vez de solo "campo no vacío".

Al agregar la validación de email se detectó además una condición de carrera: si dos envíos se disparan (por ejemplo un doble click), la respuesta de un envío anterior podía llegar después y sobreescribir el mensaje de uno más reciente. Se corrigió con un contador de secuencia (`latestRequestId`) que descarta respuestas de envíos que ya no son el más reciente.

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

- [ ] **Step 3: Agregar el selector de país al campo de teléfono**

En `index.html`, reemplazar:

```html
<div class="contact-field">
  <label for="contact-phone">Teléfono</label>
  <input id="contact-phone" name="telefono" type="tel" placeholder="(012) 345-678" autocomplete="tel"
    inputmode="tel" />
</div>
```

por:

```html
<div class="contact-field">
  <label for="contact-phone">Teléfono</label>
  <div class="contact-phone-group">
    <select id="contact-phone-country" name="telefono_pais" autocomplete="tel-country-code"
      aria-label="País para el teléfono"></select>
    <input id="contact-phone" name="telefono" type="tel" placeholder="(012) 345-678" autocomplete="tel-national"
      inputmode="tel" />
  </div>
</div>
```

(El `aria-label` en el `<select>` es necesario — sin él, el linter de accesibilidad marca el control como sin nombre accesible, ya que el `<label for="contact-phone">` de arriba solo describe el input de teléfono, no el select de país.)

- [ ] **Step 4: Instalar `libphonenumber-js` y copiar su bundle de navegador**

El sitio no usa build step (HTML/CSS/JS plano servido tal cual), así que no hay forma de `import` un paquete npm en el navegador. La solución: instalar el paquete (para tener una versión rastreada en `package.json`/lockfile) y copiar manualmente su bundle pre-compilado a `vendor/`, que se sirve como archivo estático más.

Run: `pnpm add libphonenumber-js`
Expected: agrega `libphonenumber-js` a `dependencies` en `package.json` y actualiza `pnpm-lock.yaml`.

Copiar el bundle "min" (metadata reducida, cubre todos los países con buen balance tamaño/precisión — las alternativas son `max`, más precisa y pesada, y `mobile`, solo números móviles):

```bash
mkdir -p vendor
cp "node_modules/.pnpm/libphonenumber-js@1.13.9/node_modules/libphonenumber-js/bundle/libphonenumber-min.js" vendor/libphonenumber-min.js
```

(Ajustar la ruta si la versión instalada difiere de `1.13.9` — verificar con `ls node_modules/.pnpm | grep libphonenumber-js`. Cuando se actualice el paquete en el futuro, hay que repetir este `cp` para refrescar el bundle.)

En `index.html`, antes de `<script src="script.js"></script>`, agregar:

```html
<script src="vendor/libphonenumber-min.js"></script>
```

- [ ] **Step 5: Reemplazar la lógica de `script.js`**

En `script.js`, reemplazar el bloque completo `initContactFormValidation` (líneas 219-254) por:

```js
/* Contact form: completeness guard + submission via Cloudflare Function */
(function initContactForm() {
  const form = document.querySelector('.contact-form');
  if (!form) return;

  const fields = Array.from(form.querySelectorAll('input, textarea'));
  const submitButton = form.querySelector('.contact-submit');
  const statusEl = document.getElementById('contact-status');
  const emailField = form.querySelector('#contact-email');
  const phoneField = form.querySelector('#contact-phone');
  const phoneCountrySelect = form.querySelector('#contact-phone-country');
  if (!submitButton || fields.length === 0) return;

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const hasPhoneLib = Boolean(window.libphonenumber && phoneCountrySelect);

  if (hasPhoneLib) {
    const countryNames = new Intl.DisplayNames(['es'], { type: 'region' });
    const countries = libphonenumber
      .getCountries()
      .map((code) => ({
        code,
        name: countryNames.of(code) || code,
        callingCode: libphonenumber.getCountryCallingCode(code)
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'es'));

    phoneCountrySelect.innerHTML = countries
      .map(({ code, name, callingCode }) => `<option value="${code}">${name} (+${callingCode})</option>`)
      .join('');
    phoneCountrySelect.value = countries.some((country) => country.code === 'SV') ? 'SV' : countries[0]?.code || '';
  }

  const isFormComplete = () => fields.every((field) => field.value.trim().length > 0);
  const isEmailValid = () => !emailField || EMAIL_RE.test(emailField.value.trim());
  const isPhoneValid = () => {
    if (!phoneField) return true;
    if (!hasPhoneLib) return true;
    return libphonenumber.isValidPhoneNumber(phoneField.value.trim(), phoneCountrySelect.value);
  };

  function formattedPhone() {
    if (!phoneField) return '';
    if (!hasPhoneLib) return phoneField.value.trim();
    const parsed = libphonenumber.parsePhoneNumberFromString(phoneField.value.trim(), phoneCountrySelect.value);
    return parsed ? parsed.formatInternational() : phoneField.value.trim();
  }

  function updateSubmitState() {
    const complete = isFormComplete() && isEmailValid() && isPhoneValid();
    submitButton.disabled = !complete;
    submitButton.setAttribute('aria-disabled', String(!complete));
  }

  function setStatus(message, isError) {
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.classList.toggle('contact-status--error', Boolean(isError));
  }

  let latestRequestId = 0;

  fields.forEach((field) => {
    field.addEventListener('input', updateSubmitState);
    field.addEventListener('change', updateSubmitState);
  });

  phoneCountrySelect?.addEventListener('change', updateSubmitState);

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    updateSubmitState();

    if (!isFormComplete()) {
      const firstEmptyField = fields.find((field) => field.value.trim().length === 0);
      firstEmptyField?.focus();
      return;
    }

    if (!isEmailValid()) {
      setStatus('Formato de email inválido.', true);
      emailField?.focus();
      return;
    }

    if (!isPhoneValid()) {
      setStatus('Formato de teléfono inválido para el país seleccionado.', true);
      phoneField?.focus();
      return;
    }

    const payload = {
      nombre_apellido: form.querySelector('#contact-name').value.trim(),
      empresa: form.querySelector('#contact-company').value.trim(),
      telefono: formattedPhone(),
      email: form.querySelector('#contact-email').value.trim(),
      mensaje: form.querySelector('#contact-message').value.trim()
    };

    const requestId = ++latestRequestId;

    submitButton.disabled = true;
    setStatus('Enviando...', false);

    fetch('/api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then((response) => response.json().then((data) => ({ ok: response.ok, data })))
      .then(({ ok, data }) => {
        if (requestId !== latestRequestId) return;
        if (!ok || !data.ok) {
          throw new Error(data?.error || 'No se pudo enviar el mensaje.');
        }
        setStatus('¡Mensaje enviado! Te contactaremos pronto.', false);
        form.reset();
      })
      .catch((error) => {
        if (requestId !== latestRequestId) return;
        setStatus(error.message, true);
      })
      .finally(() => {
        if (requestId !== latestRequestId) return;
        updateSubmitState();
      });
  });

  window.addEventListener('pageshow', updateSubmitState);
  setTimeout(updateSubmitState, 100);
  updateSubmitState();
})();
```

- [ ] **Step 6: Agregar estilos para el mensaje de estado y el selector de país**

En `style.css`, después de la regla `.contact-submit:not(:disabled):hover`, agregar:

```css
.contact-status {
  margin-top: 12px;
  font-size: 14px;
  color: #4d5ac4;
}

.contact-status--error {
  color: #c0392b;
}

.contact-phone-group {
  display: flex;
  gap: 8px;
}

.contact-phone-group select {
  flex: 0 0 auto;
  max-width: 40%;
  border: 1px solid rgba(77, 77, 77, 0.28);
  border-radius: 4px;
  background: #fff;
  color: #4d4d4d;
  font-size: 15px;
  padding: 10px 8px;
  outline: none;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.contact-phone-group select:focus {
  border-color: #4d5ac4;
  box-shadow: 0 0 0 3px rgba(77, 90, 196, 0.16);
}

.contact-phone-group input {
  flex: 1 1 auto;
  min-width: 0;
}
```

- [ ] **Step 7: Verificar manualmente en el navegador**

Con `pnpm run dev` corriendo (Task 3), abrir `http://127.0.0.1:8788/` (no `/index.html` directamente — Cloudflare Pages redirige `/index.html` a `/` con un 308), ir a la sección de contacto:

- Llenar todos los campos con datos válidos (el selector de país debe mostrar El Salvador seleccionado por defecto) y enviar. Expected: botón deshabilitado brevemente, "Enviando...", luego "¡Mensaje enviado! Te contactaremos pronto.", el formulario se limpia, y llega el correo a la bandeja configurada.
- Repetir con un email de formato inválido (ej. `algo@algo`, sin punto): el botón debe quedar deshabilitado automáticamente sin llegar a llamar a la red.
- Repetir con un teléfono inválido para el país seleccionado (ej. muy corto): mismo resultado, botón deshabilitado.
- Confirmar contra el servidor directamente que la validación del lado servidor sigue siendo la autoridad final (no confiar solo en la validación del cliente):
  ```bash
  curl -i -X POST http://127.0.0.1:8788/api/contact -H "Content-Type: application/json" -d '{"nombre_apellido":"Prueba","email":"jaagsolutions@esprueba","mensaje":"prueba"}'
  ```
  Expected: `400 Bad Request` con `{"fields":{"email":"Formato de email inválido."}}`.

- [ ] **Step 8: Correr los tests unitarios para confirmar que no se rompió nada**

Run: `pnpm test`
Expected: PASS — los 5 tests de la Task 2 siguen pasando (no se tocó `_validate.js`).

- [ ] **Step 9: Commit**

```bash
git add index.html script.js style.css package.json pnpm-lock.yaml vendor/libphonenumber-min.js
git commit -m "feat: submit contact form to /api/contact with client-side email/phone validation"
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
- `CONTACT_TO_EMAIL` = el correo con el que se creó la cuenta de Resend (ver la nota en la Task 3 Step 3 — mientras se use `onboarding@resend.dev`, Resend rechaza cualquier otro destinatario con `403`). Se actualiza a la dirección real (`contacto@clcolor.com`) en la Task 9 Step 7, una vez verificado el dominio en la Task 8.

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

### Task 6: Registrar el dominio en Hostinger y delegar el DNS a Cloudflare

**Files:** ninguno.

- [ ] **Step 1: Comprar `clcolor.com` en Hostinger**

Completar la compra ya iniciada en Hostinger (dominio + Hostinger Business Email). El buzón de correo se configura más adelante en la Task 9 — este paso es solo el registro del dominio y la contratación del plan de correo.

- [ ] **Step 2: Agregar el sitio a Cloudflare y delegar el DNS**

En el dashboard de Cloudflare → Add a Site → escribir `clcolor.com`. Cloudflare escanea los registros DNS existentes e indica dos nameservers (formato `*.ns.cloudflare.com`).

- [ ] **Step 3: Actualizar los nameservers en Hostinger**

En hPanel (panel de Hostinger) → Domains → `clcolor.com` → Nameservers, reemplazar los nameservers por defecto de Hostinger por los dos que dio Cloudflare en el Step 2.

- [ ] **Step 4: Verificar que el dominio quedó activo en Cloudflare**

Run: `dig NS clcolor.com +short`
Expected: los dos nameservers `*.ns.cloudflare.com` indicados por Cloudflare (puede tardar hasta un par de horas en propagar).

---

### Task 7: Conectar el dominio personalizado a Cloudflare Pages

**Files:** ninguno.

- [ ] **Step 1: Agregar el dominio personalizado al proyecto de Pages**

En el proyecto de Pages (Task 5) → Custom domains → Set up a custom domain → escribir `clcolor.com` (y opcionalmente `www.clcolor.com`). Cloudflare crea el registro DNS automáticamente porque el dominio ya vive en la misma cuenta.

- [ ] **Step 2: Verificar HTTPS y contenido en el dominio final**

Run: `curl -sI https://clcolor.com/ | head -1`
Expected: `HTTP/2 200`

Run: `curl -s https://clcolor.com/ | grep -o '<title>[^<]*</title>'`
Expected: imprime el `<title>` real de `index.html`, confirmando que sirve el contenido correcto (no una página de error/placeholder).

---

### Task 8: Verificar dominio de envío en Resend y pasar a remitente de producción

**Files:** ninguno.

- [ ] **Step 1: Agregar el dominio en Resend**

En el dashboard de Resend → Domains → Add Domain → `clcolor.com`. Resend muestra registros DNS (SPF, DKIM, y opcionalmente DMARC) a agregar.

- [ ] **Step 2: Agregar los registros DNS en Cloudflare**

En el dashboard de Cloudflare del dominio → DNS → Records, agregar exactamente los registros TXT/CNAME que mostró Resend en el paso anterior.

**Atención con el registro SPF**: un dominio solo puede tener **un** registro TXT de SPF (`v=spf1 ...`). Si al llegar a la Task 9 (buzón de Hostinger) ya existe un SPF de Resend, no se agrega un segundo TXT — se edita el existente para incluir ambos proveedores, por ejemplo `v=spf1 include:_spf.resend.com include:_spf.hostinger.com ~all` (usar los `include:` exactos que indique cada proveedor, no copiar este ejemplo literal). Confirmar el orden de las Tasks 8 y 9 al llegar a ese punto para mezclar el SPF en un solo registro.

- [ ] **Step 3: Confirmar la verificación**

En Resend → Domains, esperar a que el estado del dominio cambie a "Verified" (puede tardar algunos minutos por propagación DNS).

- [ ] **Step 4: Actualizar la variable de entorno de producción**

En Cloudflare Pages → Settings → Environment variables → Production, cambiar `CONTACT_FROM_EMAIL` de `onboarding@resend.dev` a algo como `contacto@clcolor.com`. Volver a desplegar (Retry deployment o un nuevo push) para que la Function tome el nuevo valor.

- [ ] **Step 5: Verificar el envío con el remitente definitivo**

Repetir la verificación de la Task 5 Step 5 (POST a `/api/contact` en producción) y confirmar que el correo recibido ahora muestra como remitente `contacto@clcolor.com` en vez de `onboarding@resend.dev`.

---

### Task 9: Configurar el buzón de Hostinger Business Email para `contacto@clcolor.com`

**Files:** ninguno.

Se eligió un buzón real (Hostinger Business Email) en vez de Cloudflare Email Routing porque el negocio necesita **responder** a clientes mostrando `contacto@clcolor.com` como remitente real, no solo **recibir** correo reenviado — Cloudflare Email Routing es únicamente de reenvío entrante y no da credenciales SMTP para enviar como esa dirección.

- [ ] **Step 1: Crear el buzón en hPanel**

En hPanel (panel de Hostinger) → Emails → Business Email → crear la cuenta `contacto@clcolor.com` con una contraseña.

- [ ] **Step 2: Obtener los registros DNS del correo**

hPanel muestra los registros MX, SPF y DKIM necesarios para `clcolor.com` (normalmente Hostinger ofrece agregarlos automáticamente si detecta que el DNS está en Cloudflare vía API, o los lista para agregarlos a mano).

- [ ] **Step 3: Agregar los registros en Cloudflare DNS**

En el dashboard de Cloudflare del dominio → DNS → Records:
- Agregar el/los registro(s) MX que indique Hostinger.
- Agregar el registro DKIM (TXT) tal cual lo entrega Hostinger.
- Para SPF: si ya existe el TXT de Resend (Task 8), **editarlo** para incluir también `include:_spf.hostinger.com` (o el include exacto que indique Hostinger) en el mismo registro — no crear un segundo TXT de SPF.

- [ ] **Step 4: Configurar el cliente de correo (webmail o IMAP)**

Acceder a `contacto@clcolor.com` vía el webmail de Hostinger (o configurarlo en Gmail/Outlook por IMAP con las credenciales SMTP que da Hostinger), para poder enviar y recibir desde ese buzón directamente.

- [ ] **Step 5: Verificar recepción**

Enviar un correo de prueba desde cualquier cuenta externa a `contacto@clcolor.com`.
Expected: llega al buzón en un par de minutos.

- [ ] **Step 6: Verificar envío**

Responder ese correo (o enviar uno nuevo) desde `contacto@clcolor.com` a una cuenta externa (ej. tu Gmail personal).
Expected: el correo llega mostrando `contacto@clcolor.com` como remitente, sin anotaciones tipo "on behalf of" / "vía otro dominio".

- [ ] **Step 7: Actualizar `CONTACT_TO_EMAIL` en producción**

En Cloudflare Pages → Settings → Environment variables → Production, cambiar `CONTACT_TO_EMAIL` de `cleanlinecolorstudio@gmail.com` a `contacto@clcolor.com`. Volver a desplegar y repetir la verificación de la Task 5 Step 5 para confirmar que los mensajes del formulario ya llegan al buzón corporativo.

---

### Task 10: Activar Cloudflare Web Analytics

**Files:** ninguno (configuración de plataforma; no requiere editar HTML porque el dominio ya está proxeado por Cloudflare).

- [ ] **Step 1: Activar Web Analytics para el dominio**

Dashboard de Cloudflare → Analytics & Logs → Web Analytics → Add a site → seleccionar `clcolor.com` → Automatic setup (inyección automática del beacon en las respuestas HTML del dominio proxeado; no requiere tocar el código del sitio).

- [ ] **Step 2: Verificar que hay datos**

Visitar `https://clcolor.com/` un par de veces desde el navegador, esperar 1-2 minutos, y revisar el dashboard de Web Analytics del sitio.
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

Con `pnpm run dev` corriendo, abrir la página de inicio y confirmar que la galería de videos se ve y reproduce igual que antes (el archivo eliminado no se usaba).

- [ ] **Step 4: Commit**

```bash
git commit -m "chore: remove unused 15MB gallery GIF"
```

---

## Resumen de despliegue

Al completar las Tasks 1-10, el sitio queda en producción en `https://clcolor.com` servido por Cloudflare Pages, con HTTPS/CDN/WAF automáticos, el formulario de contacto enviando correo real vía Resend hacia `contacto@clcolor.com`, un buzón corporativo real (Hostinger Business Email) capaz de enviar y recibir, y analítica básica activa — todo por ~$1.50-2/mes (dominio + buzón de Hostinger). La Task 11 es una limpieza opcional (eliminar un archivo huérfano). La Fase 2 (panel de CMS con D1/R2 para noticias/proyectos) queda fuera de este plan, para especificarse por separado cuando exista la necesidad real.
