import { validateContactPayload, isLikelyBot } from './_validate.js';

/* Tope por IP. Solo se aplica si existe el binding de KV llamado CONTACTOS;
   sin el binding la Function funciona igual, solo que sin protección de
   volumen. */
const ENVIOS_POR_VENTANA = 5;
const VENTANA_SEGUNDOS = 600;

export async function onRequest(context) {
  const { request } = context;

  if (request.method === 'POST') {
    return handleContact(context);
  }
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: { Allow: 'POST, OPTIONS' } });
  }
  /* Antes, un GET a /api/contact caía en el manejador de estáticos y devolvía
     el home con estado 200: un soft 404 más. */
  return jsonResponse({ ok: false, error: 'Método no permitido.' }, 405, { Allow: 'POST, OPTIONS' });
}

async function handleContact({ request, env }) {
  let payload;
  try {
    payload = await request.json();
  } catch (err) {
    return jsonResponse({ ok: false, error: 'JSON inválido.' }, 400);
  }

  /* Bot detectado por el campo trampa: se responde como si hubiera funcionado
     para no darle pistas, pero no se envía nada ni se gasta cuota de Resend. */
  if (isLikelyBot(payload)) {
    return jsonResponse({ ok: true }, 200);
  }

  const { valid, errors } = validateContactPayload(payload);
  if (!valid) {
    return jsonResponse({ ok: false, error: 'Datos inválidos.', fields: errors }, 400);
  }

  const ip = request.headers.get('CF-Connecting-IP') || 'desconocida';

  /* Turnstile es opcional: solo se exige cuando hay una clave configurada. */
  if (env.TURNSTILE_SECRET_KEY) {
    const verificado = await verificarTurnstile(env.TURNSTILE_SECRET_KEY, payload.turnstile_token, ip);
    if (!verificado) {
      return jsonResponse(
        { ok: false, error: 'No pudimos verificar que eres una persona. Recarga la página e inténtalo de nuevo.' },
        403
      );
    }
  }

  if (env.CONTACTOS) {
    const clave = `rate:${ip}`;
    const enviados = Number(await env.CONTACTOS.get(clave)) || 0;
    if (enviados >= ENVIOS_POR_VENTANA) {
      return jsonResponse(
        { ok: false, error: 'Demasiados envíos seguidos. Inténtalo de nuevo en unos minutos.' },
        429
      );
    }
    await env.CONTACTOS.put(clave, String(enviados + 1), { expirationTtl: VENTANA_SEGUNDOS });
  }

  const { nombre_apellido, empresa, telefono, email, mensaje } = payload;
  const recibidoEn = new Date().toISOString();

  /* El contacto se guarda ANTES de intentar el envío. Este era el punto ciego:
     si Resend fallaba, la Function devolvía un 502 genérico y el mensaje se
     perdía sin dejar rastro de que había existido. */
  const registro = {
    recibidoEn, nombre_apellido, empresa, telefono, email, mensaje, ip, entregado: false
  };
  const registroClave = `contacto:${recibidoEn}:${crypto.randomUUID()}`;
  if (env.CONTACTOS) {
    await env.CONTACTOS.put(registroClave, JSON.stringify(registro));
  }

  /* El correo lo leen los dueños de CLC, que operan desde Colombia: la marca
     de tiempo va en su huso, no en UTC. El ISO se conserva en el registro de
     KV, que es el que leen las maquinas. */
  const recibidoLocal = new Intl.DateTimeFormat('es-CO', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: 'America/Bogota'
  }).format(new Date(recibidoEn));

  const cuerpo = [
    `Nombre y apellido: ${nombre_apellido}`,
    `Empresa: ${empresa || '(no especificada)'}`,
    `Teléfono: ${telefono || '(no especificado)'}`,
    `Email: ${email}`,
    `Recibido: ${recibidoLocal} (hora de Colombia)`,
    '',
    mensaje
  ].join('\n');

  let respuesta;
  try {
    respuesta = await fetch('https://api.resend.com/emails', {
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
        text: cuerpo
      })
    });
  } catch (err) {
    console.error('[contacto] fallo de red al llamar a Resend:', err && err.message ? err.message : err);
    return jsonResponse({ ok: false, error: 'No se pudo enviar el mensaje. Inténtalo de nuevo.' }, 502);
  }

  if (!respuesta.ok) {
    /* El motivo real (403 de dominio sin verificar, 422 de remitente
       inválido, cuota agotada...) queda en los logs de Pages, que es donde
       hay que mirar cuando alguien reporta que "no llega nada". */
    const detalle = await respuesta.text().catch(() => '(sin cuerpo)');
    console.error(`[contacto] Resend respondió ${respuesta.status}: ${detalle}`);
    return jsonResponse({ ok: false, error: 'No se pudo enviar el mensaje. Inténtalo de nuevo.' }, 502);
  }

  /* El id que devuelve Resend queda en los logs de Pages. Es lo que permite
     responder "se envió el 5 de septiembre, id 6dba7b68..." cuando alguien
     pregunta por un contacto concreto, en vez de encogerse de hombros. */
  const aceptado = await respuesta.json().catch(() => null);
  const idResend = aceptado && aceptado.id ? aceptado.id : 'desconocido';
  console.log(`[contacto] entregado a Resend para ${env.CONTACT_TO_EMAIL} id=${idResend}`);

  if (env.CONTACTOS) {
    await env.CONTACTOS.put(registroClave, JSON.stringify({ ...registro, entregado: true, idResend }));
  }

  return jsonResponse({ ok: true }, 200);
}

async function verificarTurnstile(secreto, token, ip) {
  if (!token) return false;
  try {
    const cuerpo = new FormData();
    cuerpo.append('secret', secreto);
    cuerpo.append('response', token);
    cuerpo.append('remoteip', ip);
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: cuerpo
    });
    const datos = await res.json();
    if (!datos.success) {
      console.error('[contacto] Turnstile rechazó el token:', JSON.stringify(datos['error-codes'] || []));
    }
    return Boolean(datos.success);
  } catch (err) {
    console.error('[contacto] error verificando Turnstile:', err && err.message ? err.message : err);
    return false;
  }
}

function jsonResponse(body, status, extraHeaders) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...(extraHeaders || {}) }
  });
}
