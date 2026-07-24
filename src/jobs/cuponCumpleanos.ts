import cron from 'node-cron';
import { fn, col, where, Op } from 'sequelize';
import Persona from '../models/persona';
import { sendCumpleanosCuponEmail, emailConfigurado } from '../services/email.service';
import { logger } from '../libs/logger';

// Porcentaje del cupón de cumpleaños (configurable por env)
const DESCUENTO_CUMPLE = Number(process.env.CUPON_CUMPLE_PORCENTAJE) || 15;

// Genera un código de cupón legible y único-ish por persona.
const generarCodigoCupon = (nombre: string): string => {
    const base = (nombre || 'CUMPLE').replace(/[^a-zA-Z]/g, '').slice(0, 4).toUpperCase() || 'CUMPLE';
    const random = Math.random().toString(36).slice(2, 6).toUpperCase();
    return `CUMPLE-${base}-${random}`;
};

/**
 * Busca las personas cuya fecha de nacimiento (mes + día) coincide con HOY
 * y les manda el correo con el cupón de descuento para organizar su cumpleaños.
 * Exportado aparte para poder dispararlo a mano (ej. endpoint de test).
 */
export const enviarCuponesCumpleanos = async (): Promise<void> => {
    if (!emailConfigurado()) {
        logger.warn('[Job] cuponCumpleanos: SMTP no configurado — no se envían cupones de cumpleaños.');
        return;
    }

    const hoy = new Date();
    const mes = hoy.getMonth() + 1; // getMonth() es 0-based
    const dia = hoy.getDate();

    // fecha_nacimiento NULL da MONTH(NULL)=NULL y no matchea, así que quedan excluidos solos.
    const personas = await Persona.findAll({
        where: {
            [Op.and]: [
                where(fn('MONTH', col('fecha_nacimiento')), mes),
                where(fn('DAY', col('fecha_nacimiento')), dia),
            ],
        },
    });

    if (personas.length === 0) {
        logger.info('[Job] cuponCumpleanos: nadie cumple años hoy.');
        return;
    }

    let enviados = 0;
    for (const p of personas) {
        try {
            const codigo = generarCodigoCupon(p.nombre);
            await sendCumpleanosCuponEmail(p.email, p.nombre, codigo, DESCUENTO_CUMPLE);
            enviados++;
        } catch (err: any) {
            logger.error('[Job] cuponCumpleanos: error enviando cupón', { email: p.email, error: err?.message });
        }
    }

    logger.info(`[Job] cuponCumpleanos: ${enviados}/${personas.length} cupón(es) de cumpleaños enviado(s).`);
};

/**
 * Programa el envío diario a las 09:00 (hora Argentina).
 */
export const iniciarJobCuponCumpleanos = () => {
    cron.schedule('0 9 * * *', () => { enviarCuponesCumpleanos(); }, { timezone: 'America/Argentina/Mendoza' });
    logger.info('[Job] cuponCumpleanos programado (09:00 ARG)');
};
