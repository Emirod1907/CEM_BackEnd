import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { logger } from '../libs/logger';

/**
 * Valida que el webhook provenga realmente de MercadoPago.
 *
 * MP firma cada notificación con HMAC-SHA256. Los datos para reconstruir
 * la firma son:
 *   - data.id  (del body JSON)
 *   - x-request-id  (header)
 *   - ts  (timestamp extraído del header x-signature)
 *
 * Template firmado: `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`
 *
 * Ref: https://www.mercadopago.com.ar/developers/es/docs/your-integrations/notifications/webhooks
 *
 * Si MP_WEBHOOK_SECRET no está configurada se emite un warning y se
 * deja pasar la request (útil en desarrollo con sandbox). En producción
 * esta variable es OBLIGATORIA.
 */
export const validateWebhook = (req: Request, res: Response, next: NextFunction) => {
    const secret = process.env.MP_WEBHOOK_SECRET;

    if (!secret) {
        logger.warn(
            '[Webhook] MP_WEBHOOK_SECRET no configurada — validación de firma DESACTIVADA. ' +
            'Obligatoria en producción.'
        );
        return next();
    }

    const xSignature = req.headers['x-signature'] as string | undefined;
    const xRequestId = req.headers['x-request-id'] as string | undefined;

    if (!xSignature || !xRequestId) {
        return res.status(401).json({ message: 'Firma de webhook inválida' });
    }

    // x-signature tiene el formato: "ts=<timestamp>,v1=<hmac>"
    const parts = Object.fromEntries(
        xSignature.split(',').map((part) => part.split('=') as [string, string])
    );
    const ts = parts['ts'];
    const v1 = parts['v1'];

    if (!ts || !v1) {
        return res.status(401).json({ message: 'Firma de webhook inválida' });
    }

    const dataId = req.body?.data?.id;
    if (!dataId) {
        // Si no hay data.id no podemos construir el template; dejamos pasar
        // (MP puede enviar notificaciones de tipo 'test' sin data.id)
        return next();
    }

    const template = `id:${dataId};request-id:${xRequestId};ts:${ts};`;

    const expectedHmac = crypto
        .createHmac('sha256', secret)
        .update(template)
        .digest('hex');

    // Comparación de tiempo constante para evitar timing attacks
    const expectedBuf = Buffer.from(expectedHmac, 'hex');
    const receivedBuf = Buffer.from(v1, 'hex');

    if (
        expectedBuf.length !== receivedBuf.length ||
        !crypto.timingSafeEqual(expectedBuf, receivedBuf)
    ) {
        logger.warn('[Webhook] Firma inválida recibida. Posible request fraudulenta.');
        return res.status(401).json({ message: 'Firma de webhook inválida' });
    }

    next();
};
