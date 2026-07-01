import winston from 'winston';

// Campos que nunca deben aparecer en logs
const SENSITIVE_KEYS = new Set([
    'user_password',
    'password',
    'token',
    'authorization',
    'cookie',
    'mp_access_token',
    'access_token',
    'accessToken',
    'google_client_secret',
    'clientSecret',
    'dni',
    'x-signature',
]);

/**
 * Recorre un objeto recursivamente y reemplaza campos sensibles por [REDACTED].
 * Seguro usar antes de pasarle cualquier objeto a logger.info/debug/error.
 */
export function sanitizeForLog(obj: unknown, depth = 0): unknown {
    if (depth > 6 || obj === null || obj === undefined) return obj;
    if (typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map((item) => sanitizeForLog(item, depth + 1));

    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
        if (SENSITIVE_KEYS.has(key.toLowerCase())) {
            sanitized[key] = '[REDACTED]';
        } else {
            sanitized[key] = sanitizeForLog(value, depth + 1);
        }
    }
    return sanitized;
}

const isDev = process.env.NODE_ENV !== 'production';

const devFormat = winston.format.combine(
    winston.format.colorize(),
    winston.format.printf(({ level, message, ...meta }) => {
        const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
        return `${level}: ${message}${metaStr}`;
    })
);

const prodFormat = winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
);

const transports: winston.transport[] = [
    new winston.transports.Console({
        format: isDev ? devFormat : prodFormat,
    }),
];

if (!isDev) {
    transports.push(
        new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
        new winston.transports.File({ filename: 'logs/combined.log' })
    );
}

export const logger = winston.createLogger({
    level: isDev ? 'debug' : 'info',
    transports,
});
