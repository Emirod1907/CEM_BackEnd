import rateLimit from 'express-rate-limit';

// Login y register: máximo 5 intentos por IP cada 15 minutos
export const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Demasiados intentos. Intentá de nuevo en 15 minutos.' },
});

// Webhook de MercadoPago: 100 requests por IP por minuto (bucket propio, no comparte con global)
export const webhookLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Demasiadas notificaciones recibidas.' },
});

// Límite general para toda la API (excluye /api/pagos/webhook, que tiene su propio bucket)
export const globalLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Demasiadas solicitudes. Intentá de nuevo en un minuto.' },
    skip: (req) => req.path === '/api/pagos/webhook',
});
