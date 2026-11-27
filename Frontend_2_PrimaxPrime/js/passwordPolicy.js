export function validatePrimePassword(password) {
  if (typeof password === 'string' && new TextEncoder().encode(password).length > 72) {
    throw Error('Tu contraseña es demasiado larga. Prueba con una más corta.');
  }
  if (typeof password !== 'string' || [...password].length < 8 ||
      !/^(?=.*[A-Z])(?=.*[a-z])(?=.*[0-9])(?=.*[^A-Za-z0-9])[^\r\n\u2028\u2029]+$/.test(password)) {
    throw Error('La contraseña debe tener al menos 8 caracteres, mayúscula, minúscula, número y carácter especial.');
  }
}
