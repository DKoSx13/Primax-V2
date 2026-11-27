import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePrimePassword } from '../js/passwordPolicy.js';

test('Prime exige las cinco condiciones de contraseña', () => {
  assert.doesNotThrow(() => validatePrimePassword('Primax12!'));
  for (const password of ['primax12!', 'PRIMAX12!', 'Primaxxx!', 'Primax123', 'Pr1!', 'Pa1!😀😀😀', 'Primax12!\u2028Z', 'Pa1!' + 'é'.repeat(35)]) {
    assert.throws(() => validatePrimePassword(password));
  }
});

test('acepta hasta 72 bytes UTF-8 y explica el exceso sin jerga técnica', () => {
  for (const password of ['Aa1!' + 'x'.repeat(68), 'Aa1!' + 'é'.repeat(34)]) {
    assert.equal(new TextEncoder().encode(password).length, 72);
    assert.doesNotThrow(() => validatePrimePassword(password));
    assert.throws(() => validatePrimePassword(password + 'x'), /Tu contraseña es demasiado larga/);
  }
});
