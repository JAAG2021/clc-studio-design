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
