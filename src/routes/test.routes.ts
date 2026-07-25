import { Router, RequestHandler } from 'express';
import { sendCumpleanosCuponEmail, emailConfigurado } from '../services/email.service';
import { logger } from '../libs/logger';

const router = Router();

/**
 * Endpoint TEMPORAL para probar el envío del cupón de cumpleaños sin esperar al
 * cron de las 09:00. Está deshabilitado (404) salvo que exista TEST_EMAIL_SECRET,
 * y exige que el body traiga ese mismo secret. Cuando termines de probar, borrá la
 * variable TEST_EMAIL_SECRET (o este archivo).
 *
 *   POST /api/test/cupon
 *   body: { "secret": "<TEST_EMAIL_SECRET>", "email": "destino@gmail.com", "nombre": "Emi", "porcentaje": 15 }
 */
const probarCupon: RequestHandler = async (req, res) => {
    const secretEsperado = process.env.TEST_EMAIL_SECRET;
    if (!secretEsperado) return res.status(404).json({ message: 'No disponible' });

    const { secret, email, nombre, porcentaje } = req.body || {};
    if (secret !== secretEsperado) return res.status(403).json({ message: 'Secret inválido' });
    if (!email) return res.status(400).json({ message: 'Falta el campo email' });
    if (!emailConfigurado()) {
        return res.status(503).json({ message: 'Email no configurado: faltan GMAIL_REFRESH_TOKEN / EMAIL_USER' });
    }

    try {
        await sendCumpleanosCuponEmail(email, nombre || 'Prueba', 'CUMPLE-TEST-1234', Number(porcentaje) || 15);
        logger.info(`[Test] Cupón de prueba enviado a ${email}`);
        return res.json({ message: 'Cupón enviado', to: email });
    } catch (err: any) {
        logger.error('[Test] Error enviando cupón de prueba', { error: err?.message });
        return res.status(500).json({ message: 'Error al enviar', error: err?.message });
    }
};

router.post('/cupon', probarCupon);

export default router;
