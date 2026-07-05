import { Router } from 'express';
import type { RequestHandler } from 'express';
import authRequired from '../middlewares/validateToken';
import { validateWebhook } from '../middlewares/validateWebhook';
import { crearPreferencia, crearPreferenciaOrganizador, webhook, retornoPago, confirmarPago, verificarOrden, getMisOrdenes, getOrden, simularPagoAprobado } from '../controllers/pago.controller';
import { webhookLimiter } from '../middlewares/rateLimiter';

const router = Router();

const developmentOnly: RequestHandler = (_req, res, next) => {
    if (process.env.NODE_ENV !== 'development') {
        return res.status(404).end();
    }

    return next();
};

// Webhook público (MercadoPago lo llama directamente)
// validateWebhook verifica la firma HMAC antes de procesar la notificación
router.post('/webhook', webhookLimiter, validateWebhook, webhook);

// Retorno público del checkout (puente https → frontend)
router.get('/retorno/:tipo', retornoPago);

// Rutas protegidas
router.post('/crear-preferencia', authRequired, crearPreferencia);
router.post('/crear-preferencia-organizador', authRequired, crearPreferenciaOrganizador);
router.post('/confirmar', authRequired, confirmarPago);
router.post('/simular-aprobado', developmentOnly, authRequired, simularPagoAprobado);
router.get('/mis-ordenes', authRequired, getMisOrdenes);
router.get('/orden/:id/verificar', authRequired, verificarOrden);
router.get('/orden/:id', authRequired, getOrden);

export default router;
