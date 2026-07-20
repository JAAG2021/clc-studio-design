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
    const debugBody = await resendResponse.text();
    return jsonResponse(
      { ok: false, error: 'No se pudo enviar el mensaje. Intenta de nuevo.', debugStatus: resendResponse.status, debugBody },
      502
    );
  }

  return jsonResponse({ ok: true }, 200);
}

function jsonResponse(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}
