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
