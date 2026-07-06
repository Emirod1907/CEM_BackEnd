// Emails con acceso total sin importar el rol activo (para testear todos los perfiles).
// Además de los base, se pueden sumar desde la variable de entorno FULL_ACCESS_EMAILS
// (separados por coma), así cada quien prueba todos los roles con su propio mail sin tocar el código.
const BASE = ['emi.electro2012@gmail.com', 'emi.rodri1907guez@gmail.com', 'francopereiraperiodista@gmail.com', 'dreamevents490@gmail.com'];

const desdeEnv = (process.env.FULL_ACCESS_EMAILS || '')
    .split(',')
    .map(e => e.trim())
    .filter(Boolean);

export const EMAILS_PERMITIDOS = [...new Set([...BASE, ...desdeEnv])];
