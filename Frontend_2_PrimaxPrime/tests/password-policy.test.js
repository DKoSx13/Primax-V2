import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePrimePassword } from '../js/passwordPolicy.js';

test('Prime exige las cinco condiciones de contraseña', () => {
  assert.doesNotThrow(() => validatePrimePassword('Primax12!'));
  for (const password of ['primax12!', 'PRIMAX12!', 'Primaxxx!', 'Primax123', 'Pr1!']) {
    assert.throws(() => validatePrimePassword(password));
  }
});
