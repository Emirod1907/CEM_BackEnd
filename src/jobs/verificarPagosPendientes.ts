import { Op } from 'sequelize';
import { MercadoPagoConfig, Payment } from 'mercadopago';
import Orden from '../models/orden';
import { procesarPagoMP } from '../controllers/pago.controller';
import { getMpCredentials, getMpNotificationUrl } from '../config/mercadopago';
import { logger } from '../libs/logger';

const INTERVALO_MS = 15_000;
const VENTANA_MS = 2 * 60 * 60 * 1000; // solo órdenes de las últimas 2 horas
const MAX_ORDENES_POR_CICLO = 10;

let enEjecucion = false;

/**
 * Reemplazo del webhook para entornos sin URL pública (localhost): cada 15s
 * busca en MercadoPago los pagos de las órdenes pendientes recientes (por
 * external_reference) y los aplica con la misma lógica idempotente del webhook.
 * Así el pago se acredita en el sistema segundos después de pagar, sin
 * depender de que MP redirija al usuario de vuelta a la app.
 */
export const iniciarJobVerificarPagos = () => {
    if (getMpNotificationUrl()) {
        logger.info('[Job] Webhook público de MP configurado — verificarPagosPendientes no es necesario');
        return;
    }

    setInterval(async () => {
        if (enEjecucion) return;
        enEjecucion = true;
        try {
            const pendientes = await Orden.findAll({
                where: {
                    estado: 'pendiente',
                    fecha_creacion: { [Op.gte]: new Date(Date.now() - VENTANA_MS) }
                },
                order: [['fecha_creacion', 'DESC']],
                limit: MAX_ORDENES_POR_CICLO
            });
            if (pendientes.length === 0) return;

            const { accessToken } = getMpCredentials();
            const payment = new Payment(new MercadoPagoConfig({ accessToken }));

            for (const orden of pendientes) {
                try {
                    const busqueda = await payment.search({
                        options: {
                            external_reference: String(orden.id_orden),
                            sort: 'date_created',
                            criteria: 'desc'
                        }
                    });
                    const pagos: any[] = busqueda.results || [];
                    // Priorizar un pago aprobado; si no hay, tomar el más reciente
                    const pago = pagos.find((p) => p.status === 'approved') || pagos[0];
                    if (pago) {
                        await procesarPagoMP(pago);
                        logger.info('[Job] Pago detectado y aplicado', {
                            id_orden: orden.id_orden,
                            payment_id: pago.id,
                            status: pago.status
                        });
                    }
                } catch (err) {
                    logger.warn('[Job] Error verificando orden contra MP', {
                        id_orden: orden.id_orden,
                        error: String(err)
                    });
                }
            }
        } catch (error) {
            logger.error('[Job] Error en verificarPagosPendientes', { error: String(error) });
        } finally {
            enEjecucion = false;
        }
    }, INTERVALO_MS);

    logger.info(`[Job] verificarPagosPendientes activo (cada ${INTERVALO_MS / 1000}s, sin webhook público)`);
};
