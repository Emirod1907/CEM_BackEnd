import cron from 'node-cron';
import { Op } from 'sequelize';
import Reserva from '../models/reserva';
import Orden from '../models/orden';
import { logger } from '../libs/logger';

/**
 * Corre todos los días a medianoche.
 * Cancela todas las reservas en estado 'pendiente_pago' cuya
 * fecha_limite_pago ya pasó, liberando la fecha del salón y
 * los cupos de servicios automáticamente.
 */
export const iniciarJobLiberacionVencidas = () => {
    cron.schedule('0 0 * * *', async () => {
        try {
            const hoy = new Date();
            hoy.setHours(0, 0, 0, 0);

            const vencidas = await Reserva.findAll({
                where: {
                    estado: 'pendiente_pago',
                    fecha_limite_pago: { [Op.lt]: hoy }
                },
                attributes: ['id_reserva']
            });

            if (vencidas.length === 0) return;

            const ids = vencidas.map(r => r.id_reserva);

            // Cancelar órdenes vinculadas → libera cupos de servicios
            await Orden.update(
                { estado: 'cancelado' },
                { where: { reserva_id: { [Op.in]: ids } } }
            );

            // Cancelar reservas → libera fechas de salón
            await Reserva.update(
                { estado: 'cancelada' },
                { where: { id_reserva: { [Op.in]: ids } } }
            );

            logger.info(`[Job] ${ids.length} reserva(s) vencida(s) cancelada(s) por falta de pago.`, { ids });
        } catch (error) {
            logger.error('[Job] Error al liberar reservas vencidas', { error: String(error) });
        }
    }, { timezone: 'America/Argentina/Mendoza' });

    logger.info('[Job] liberarReservasVencidas programado (00:00 ARG)');
};
