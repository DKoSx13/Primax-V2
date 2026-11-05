export function validatePrimePassword(password) {
  if (typeof password !== 'string' || password.length < 8 ||
      !/[A-Z]/.test(password) || !/[a-z]/.test(password) ||
      !/[0-9]/.test(password) || !/[^A-Za-z0-9]/.test(password) ||
      new TextEncoder().encode(password).length > 72) {
    throw Error('La contraseña debe tener al menos 8 caracteres, mayúscula, minúscula, número y carácter especial (máximo 72 bytes).');
  }
}
