import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateContactPayload, isLikelyBot } from '../functions/api/_validate.js';

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

/* Regresión del bug de producción: el cliente exigía empresa y teléfono para
   habilitar el botón, mientras el servidor siempre los consideró opcionales.
   Este test fija el contrato para que ambos lados no vuelvan a divergir. */
test('empresa y teléfono son opcionales', () => {
  const result = validateContactPayload({
    nombre_apellido: 'Ana Pérez',
    email: 'ana@example.com',
    mensaje: 'Hola, quiero cotizar un proyecto.'
  });
  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, {});
});

test('empresa y teléfono vacíos tampoco invalidan', () => {
  const result = validateContactPayload({
    nombre_apellido: 'Ana Pérez',
    empresa: '',
    telefono: '',
    email: 'ana@example.com',
    mensaje: 'Hola'
  });
  assert.equal(result.valid, true);
});

/* El formulario lleva un campo "website" fuera de pantalla que ninguna persona
   ve. Los bots rellenan todos los campos, asi que si llega con contenido el
   envio se descarta en silencio, sin gastar cuota de Resend. */
test('un envio con el campo trampa relleno se detecta como bot', () => {
  assert.equal(isLikelyBot({ website: 'http://spam.example' }), true);
});

test('espacios en blanco en el campo trampa también cuentan como bot', () => {
  assert.equal(isLikelyBot({ website: '   x   ' }), true);
});

test('un envio normal no se detecta como bot', () => {
  assert.equal(isLikelyBot({ website: '' }), false);
  assert.equal(isLikelyBot({ website: '   ' }), false);
  assert.equal(isLikelyBot({}), false);
  assert.equal(isLikelyBot(null), false);
});
