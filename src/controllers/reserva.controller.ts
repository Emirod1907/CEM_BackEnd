import { Request, Response, RequestHandler } from 'express';
import Reserva from '../models/reserva';
import Salon from '../models/salon';
import Evento from '../models/evento';
import { upsertEventoReserva, borrarEventoReserva } from '../services/googleCalendarSync';
import Orden from '../models/orden';
import Contrato from '../models/contrato';
import { Op, Transaction } from 'sequelize';
import db from '../db/connection';
import { logger } from '../libs/logger';
import { calcularReembolso, MotivoCancelacion, MOTIVOS_CANCELACION } from '../services/reembolso.service';
import { ejecutarReembolsoReserva } from '../services/reembolsoMp.service';

const PORCENTAJE_SENA = 0.30;
const HORAS_LIMITE_PAGO = 48;
// Se puede cambiar la fecha del evento (mismo salón) sin penalidad hasta N días antes
const DIAS_LIMITE_CAMBIO_FECHA = 7;

// POST /api/reservas/solicitar
// ── Helpers de precio dinámico ─────────────────────────────────────────────────
function parsePreciosConfig(val: any): any {
    if (!val) return null;
    try {
        const parsed = typeof val === 'string' ? JSON.parse(val) : val;
        if (Array.isArray(parsed)) return null;
        return parsed;
    } catch { return null; }
}

function esFindeSemana(fechaStr: string): boolean {
    const d = new Date(fechaStr.substring(0, 10) + 'T12:00:00');
    return d.getDay() === 0 || d.getDay() === 6;
}

const FERIADOS_AR = new Set([
    '2025-01-01','2025-03-03','2025-03-04','2025-03-24','2025-04-02',
    '2025-04-17','2025-04-18','2025-05-01','2025-05-25','2025-06-20',
    '2025-07-09','2025-08-18','2025-10-13','2025-11-21','2025-12-08','2025-12-25',
    '2026-01-01','2026-02-16','2026-02-17','2026-03-24','2026-04-02',
    '2026-04-02','2026-04-03','2026-05-01','2026-05-25','2026-06-15',
    '2026-07-09','2026-08-17','2026-10-12','2026-11-20','2026-12-08','2026-12-25',
    '2027-01-01','2027-02-08','2027-02-09','2027-03-24','2027-03-25',
    '2027-03-26','2027-04-02','2027-05-01','2027-05-25','2027-06-21',
    '2027-07-09','2027-08-16','2027-10-11','2027-11-22','2027-12-08','2027-12-25',
]);

function esFeriado(fechaStr: string): boolean {
    return FERIADOS_AR.has(fechaStr.substring(0, 10));
}

// Debe coincidir con calcularPrecioEvento del frontend (utils/preciosUtils.js),
// pero trabaja sobre el precio BASE (la comisión se aplica después al mostrar).
// Soporta: monto fijo por día, % de incremento (feriado_pct/fin_semana_pct),
// precio por hora y precio por tramos de duración (tramos_horarios).
export function calcularMontoAlquiler(precioBase: number, preciosConfig: any, fecha: string, horas: number): number {
    const cfg = parsePreciosConfig(preciosConfig);
    if (!cfg) return precioBase;

    const finde = esFindeSemana(fecha);
    const feriado = esFeriado(fecha);
    const h = Math.max(1, horas || 1);

    // % de incremento sobre el precio base para el día (alternativa al monto fijo)
    const pctDia: number | null = feriado ? (cfg.feriado_pct ?? null)
                                : finde ? (cfg.fin_semana_pct ?? null)
                                : null;

    if (cfg.por_hora) {
        const horaBase = cfg.precio_hora != null ? Number(cfg.precio_hora) : precioBase;
        let precioHora = horaBase;
        if (feriado) {
            if (cfg.precio_hora_feriado != null) precioHora = Number(cfg.precio_hora_feriado);
            else if (pctDia != null) precioHora = +(horaBase * (1 + Number(pctDia) / 100)).toFixed(2);
        } else if (finde) {
            if (cfg.precio_hora_fin_semana != null) precioHora = Number(cfg.precio_hora_fin_semana);
            else if (pctDia != null) precioHora = +(horaBase * (1 + Number(pctDia) / 100)).toFixed(2);
        }
        return +(precioHora * h).toFixed(2);
    }

    // Tramos por duración (3hs → $X, 4hs → $Y): el tramo más corto que cubre h
    const tramos = Array.isArray(cfg.tramos_horarios)
        ? cfg.tramos_horarios.filter((t: any) => t && Number(t.horas) > 0 && t.precio != null)
        : [];
    if (tramos.length > 0) {
        const ordenados = [...tramos].sort((a: any, b: any) => Number(a.horas) - Number(b.horas));
        const tramo = ordenados.find((t: any) => Number(t.horas) >= h) || ordenados[ordenados.length - 1];
        let precio = Number(tramo.precio);
        if (pctDia != null) precio = +(precio * (1 + Number(pctDia) / 100)).toFixed(2);
        return +precio.toFixed(2);
    }

    let precio = precioBase;
    if (feriado && cfg.feriado != null) precio = Number(cfg.feriado);
    else if (finde && cfg.fin_semana != null) precio = Number(cfg.fin_semana);
    else if (pctDia != null) precio = +(precioBase * (1 + Number(pctDia) / 100)).toFixed(2);
    return +precio.toFixed(2);
}

function fechaAStr(fecha: any): string {
    if (typeof fecha === 'string') return fecha.substring(0, 10);
    try { return new Date(fecha).toISOString().slice(0, 10); } catch { return String(fecha); }
}

// Duración del evento (horas) a partir de hora_inicio/hora_fin de datos_evento.
// Maneja eventos que cruzan la medianoche. Usada para precio por hora y por tramos.
function horasDesdeDatosEvento(datos: any): number {
    const hi = datos?.hora_inicio, hf = datos?.hora_fin;
    if (!hi || !hf) return 1;
    const [h1, m1] = String(hi).split(':').map(Number);
    const [h2, m2] = String(hf).split(':').map(Number);
    if ([h1, m1, h2, m2].some(n => Number.isNaN(n))) return 1;
    const mins = ((h2 * 60 + m2) - (h1 * 60 + m1) + 1440) % 1440;
    return mins > 0 ? Math.max(1, Math.ceil(mins / 60)) : 1;
}

// Recalcula el alquiler de una reserva PENDIENTE según la config vigente del salón
// (precio base, feriado/finde, %, tramos) y lo persiste si cambió. Las reservas ya
// señadas/confirmadas/pagadas quedan congeladas con el monto del momento de pago.
export async function montoAlquilerVigente(reserva: any, salon: any): Promise<number> {
    const guardado = Number(reserva.monto_alquiler);
    if (reserva.estado !== 'pendiente_pago' || !salon) return guardado;
    const precioBase = Number(salon.precio_alquiler) || 0;
    if (!precioBase) return guardado;
    let datos: any = null;
    try { datos = reserva.datos_evento ? JSON.parse(reserva.datos_evento) : null; } catch { /* ignore */ }
    const horas = horasDesdeDatosEvento(datos);
    const recalc = calcularMontoAlquiler(precioBase, salon.precios_config, fechaAStr(reserva.fecha), horas);
    if (recalc > 0 && recalc !== guardado) {
        try { await reserva.update({ monto_alquiler: recalc }); } catch { /* best-effort */ }
        return recalc;
    }
    return guardado;
}
// ───────────────────────────────────────────────────────────────────────────────

export const solicitarReserva: RequestHandler = async (req: Request, res: Response) => {
    const { salon_id, fecha, datos_evento, horas } = req.body;
    const persona_id = req.persona!.id_persona;

    if (!salon_id || !fecha || !datos_evento) {
        return res.status(400).json({ message: 'Faltan datos: salon_id, fecha y datos_evento son requeridos' });

    }

    const t = await db.transaction();
    try {
        // SELECT FOR UPDATE: bloquea las filas que matcheen mientras dure la transacción.
        // Si dos requests llegan al mismo tiempo, la segunda espera aquí hasta que
        // la primera haga commit o rollback, eliminando la race condition.
        const reservaExistente = await Reserva.findOne({
            where: {
                salon_id,
                fecha,
                estado: { [Op.ne]: 'cancelada' }
            },
            lock: Transaction.LOCK.UPDATE,
            transaction: t
        });

        if (reservaExistente) {
            await t.rollback();
            return res.status(409).json({ message: 'El salón no está disponible en esa fecha' });
        }

        const salon = await Salon.findByPk(salon_id, { transaction: t });
        if (!salon) {
            await t.rollback();
            return res.status(404).json({ message: 'Salón no encontrado' });
        }

        const precioBase = Number(salon.precio_alquiler) || 0;
        const monto_alquiler = calcularMontoAlquiler(precioBase, salon.precios_config, fecha, Number(horas) || 0);

        // Comisión del cliente (frozen del contrato vigente del dueño) — solo para informar al frontend
        let comision_cliente_porcentaje = 0;
        if ((salon as any).dueno_id) {
            const contrato = await Contrato.findOne({
                where: { persona_id: (salon as any).dueno_id, estado: 'vigente', ambito: 'salon' },
                attributes: ['comision_cliente_porcentaje'],
                transaction: t
            });
            if (contrato) comision_cliente_porcentaje = Number(contrato.comision_cliente_porcentaje);
        }
        const monto_sena = +(monto_alquiler * PORCENTAJE_SENA).toFixed(2);
        const fecha_limite_pago = new Date(Date.now() + HORAS_LIMITE_PAGO * 60 * 60 * 1000);

        const reserva = await Reserva.create({
            salon_id,
            fecha,
            persona_id,
            evento_id: null as any,
            estado: 'pendiente_pago',
            datos_evento: JSON.stringify(datos_evento),
            monto_alquiler,
            fecha_limite_pago
        }, { transaction: t });

        // Para eventos privados: crear el Evento como borrador de inmediato
        // para que el organizador pueda enviar invitaciones antes de pagar
        if (datos_evento.es_publico === false) {
            const eventoInicial = await Evento.create({
                nombre: datos_evento.nombre || 'Evento privado',
                descripcion: datos_evento.descripcion || null,
                fecha: datos_evento.fecha,
                precio: datos_evento.precio || 0,
                cupo: datos_evento.cupo || 0,
                imagen: datos_evento.imagen || '',
                salon_id,
                creado_por: persona_id,
                es_publico: false,   // este bloque es solo para eventos privados
                estado: 'borrador'
            }, { transaction: t });

            await reserva.update({ evento_id: eventoInicial.id_evento }, { transaction: t });
        }

        await t.commit();

        return res.status(201).json({
            reserva: {
                id_reserva: reserva.id_reserva,
                salon_id: reserva.salon_id,
                salon_nombre: salon.nombre,
                salon_domicilio: salon.domicilio,
                fecha: reserva.fecha,
                estado: reserva.estado,
                monto_alquiler,
                monto_sena,
                porcentaje_sena: PORCENTAJE_SENA * 100,
                comision_cliente_porcentaje,
                fecha_limite_pago: reserva.fecha_limite_pago,
                datos_evento
            }
        });
    } catch (error: any) {
        await t.rollback();

        // Capa DB: si dos requests pasaron el lock simultáneamente (ej: instancias múltiples),
        // el UNIQUE constraint en (salon_id, fecha_activa) lo frena aquí.
        if (error.name === 'SequelizeUniqueConstraintError') {
            return res.status(409).json({
                message: 'La fecha ya fue reservada por otro usuario. Por favor refrescá y elegí otra fecha.'
            });
        }

        logger.error('[Reserva] Error al solicitar reserva', { error: error.message });
        return res.status(500).json({ message: 'Error al crear la reserva', error: error.message });
    }
};

// GET /api/reservas/mis-reservas
export const getMisReservas: RequestHandler = async (req: Request, res: Response) => {
    const persona_id = req.persona!.id_persona;
    try {
        await Reserva.update(
            { estado: 'cancelada' },
            {
                where: {
                    persona_id,
                    estado: 'pendiente_pago',
                    fecha_limite_pago: { [Op.lt]: new Date() }
                }
            }
        );

        const reservas = await Reserva.findAll({
            where: { persona_id },
            include: [
                { model: Salon,  as: 'Salon',  attributes: ['nombre', 'domicilio', 'precio_alquiler', 'precios_config'] },
                { model: Evento, as: 'Evento', attributes: ['nombre', 'estado'], required: false }
            ],
            order: [['createdAt', 'DESC']]
        });

        // Buscar comisiones por salón en lote (evita N+1)
        const salonIds = [...new Set(reservas.map(r => r.salon_id))]
        const salonesConDueno = await Salon.findAll({
            where: { id_salon: salonIds },
            attributes: ['id_salon', 'dueno_id']
        })
        const duenoPorSalon = new Map(salonesConDueno.map(s => [s.id_salon, (s as any).dueno_id]))
        const duenioIds = [...new Set([...duenoPorSalon.values()].filter(Boolean))]
        const contratos = duenioIds.length > 0
            ? await Contrato.findAll({
                where: { persona_id: duenioIds, estado: 'vigente', ambito: 'salon' },
                attributes: ['persona_id', 'comision_cliente_porcentaje']
            })
            : []
        const comisionPorDueno = new Map(contratos.map(c => [c.persona_id, Number(c.comision_cliente_porcentaje)]))

        const reservasParseadas = await Promise.all(reservas.map(async (r) => {
            // Reservas pendientes: precio según config vigente del salón (feriado/finde/%/tramos)
            const monto_alquiler = await montoAlquilerVigente(r, (r as any).Salon);
            const json = r.toJSON() as any;
            json.monto_alquiler = monto_alquiler;
            const dueno_id = duenoPorSalon.get(r.salon_id)
            const comision_cliente_porcentaje = dueno_id ? (comisionPorDueno.get(dueno_id) ?? 0) : 0
            const factorComision = 1 + comision_cliente_porcentaje / 100
            const monto_alquiler_con_comision = +(monto_alquiler * factorComision).toFixed(2)
            const monto_sena = +(monto_alquiler_con_comision * PORCENTAJE_SENA).toFixed(2)
            return {
                ...json,
                datos_evento: r.datos_evento ? JSON.parse(r.datos_evento) : null,
                comision_cliente_porcentaje,
                monto_sena
            };
        }));

        return res.json({ reservas: reservasParseadas });
    } catch (error: any) {
        return res.status(500).json({ message: 'Error al obtener reservas', error: error.message });
    }
};

// GET /api/reservas/:id
export const getReservaDetalle: RequestHandler = async (req: Request, res: Response) => {
    const { id } = req.params;
    const persona_id = req.persona!.id_persona;
    try {
        const reserva = await Reserva.findOne({
            where: { id_reserva: id, persona_id },
            include: [
                {
                    model: Salon, as: 'Salon',
                    attributes: ['nombre', 'domicilio', 'localidad', 'provincia', 'departamento', 'aforo', 'servicios_incluidos', 'tipos_evento', 'imagen', 'precio_alquiler', 'precios_config']
                },
                {
                    model: Evento, as: 'Evento',
                    attributes: ['nombre', 'estado', 'fecha', 'precio', 'cupo', 'imagen'],
                    required: false
                }
            ]
        });

        if (!reserva) {
            return res.status(404).json({ message: 'Reserva no encontrada' });
        }

        const ordenes = await Orden.findAll({
            where: { reserva_id: id, persona_id },
            order: [['fecha_creacion', 'DESC']]
        });

        // Reserva pendiente: precio según config vigente del salón (feriado/finde/%/tramos)
        const monto_alquiler = await montoAlquilerVigente(reserva, (reserva as any).Salon);
        const monto_sena = +(monto_alquiler * PORCENTAJE_SENA).toFixed(2);

        // Comisión del cliente para mostrar precio correcto en el detalle
        let comision_cliente_porcentaje = 0;
        try {
            const salonData = await Salon.findByPk(reserva.salon_id, { attributes: ['dueno_id'] });
            if ((salonData as any)?.dueno_id) {
                const contrato = await Contrato.findOne({
                    where: { persona_id: (salonData as any).dueno_id, estado: 'vigente', ambito: 'salon' },
                    attributes: ['comision_cliente_porcentaje'],
                });
                if (contrato) comision_cliente_porcentaje = Number(contrato.comision_cliente_porcentaje);
            }
        } catch { /* sin contrato → sin comisión */ }

        const reservaData = reserva.toJSON() as any;
        reservaData.monto_alquiler = monto_alquiler;

        // Con as: 'Salon' la clave está garantizada como 'Salon'
        const salonRaw = reservaData.Salon || null;
        const salonParseado = salonRaw ? {
            ...salonRaw,
            servicios_incluidos: (() => {
                try { return JSON.parse(salonRaw.servicios_incluidos || '[]') } catch { return [] }
            })(),
            tipos_evento: (() => {
                try { return JSON.parse(salonRaw.tipos_evento || '[]') } catch { return [] }
            })(),
        } : null;

        const ordenesParseadas = ordenes.map(o => {
            let items: any[] = [];
            try { items = JSON.parse(o.items) } catch {}
            return { ...o.toJSON(), items };
        });

        // Servicios: prioridad → orden aprobada → cualquier orden → datos_evento
        const serviciosContratados = (() => {
            const ordenAprobada = ordenesParseadas.find(o => o.estado === 'aprobado');
            const ordenFuente = ordenAprobada || ordenesParseadas[0];
            if (ordenFuente?.items?.length) {
                const deOrden = (ordenFuente.items as any[]).filter(
                    (item: any) => item.tipo !== 'alquiler' && (item.id_servicio || item.nombre)
                );
                if (deOrden.length > 0) return deOrden;
            }
            // Fallback: servicios guardados en datos_evento al iniciar el pago
            try {
                const de = reserva.datos_evento ? JSON.parse(reserva.datos_evento) : {};
                return de.servicios || [];
            } catch { return []; }
        })();

        return res.json({
            reserva: {
                ...reservaData,
                Salon: salonParseado,
                datos_evento: reserva.datos_evento ? JSON.parse(reserva.datos_evento) : null,
                monto_sena,
                comision_cliente_porcentaje
            },
            ordenes: ordenesParseadas,
            servicios_contratados: serviciosContratados
        });
    } catch (error: any) {
        return res.status(500).json({ message: 'Error al obtener detalle de reserva', error: error.message });
    }
};

// PUT /api/reservas/:id/servicios
// Guarda los servicios seleccionados en datos_evento de la reserva
export const actualizarServiciosReserva: RequestHandler = async (req: Request, res: Response) => {
    const { id } = req.params;
    const persona_id = req.persona!.id_persona;
    const { servicios, numInvitados } = req.body;

    try {
        const reserva = await Reserva.findOne({ where: { id_reserva: id, persona_id } });
        if (!reserva) {
            return res.status(404).json({ message: 'Reserva no encontrada' });
        }

        let datos: any = {};
        try { datos = reserva.datos_evento ? JSON.parse(reserva.datos_evento) : {} } catch {}

        datos.servicios = Array.isArray(servicios) ? servicios : [];
        if (numInvitados !== undefined && numInvitados !== null && Number(numInvitados) > 0) {
            datos.numInvitados = Number(numInvitados);
        }
        await reserva.update({ datos_evento: JSON.stringify(datos) });

        return res.json({ ok: true });
    } catch (error: any) {
        return res.status(500).json({ message: 'Error al actualizar servicios', error: error.message });
    }
};

// PATCH /api/reservas/:id/fecha — cambia la fecha del evento en el MISMO salón,
// hasta N días antes sin penalidad, verificando disponibilidad y recalculando el
// precio según el tipo de día (feriado / fin de semana / hábil) del salón.
export const cambiarFechaReserva: RequestHandler = async (req: Request, res: Response) => {
    const { id } = req.params;
    const persona_id = req.persona!.id_persona;
    const nuevaFecha = String(req.body?.fecha || '').slice(0, 10);

    if (!nuevaFecha) return res.status(400).json({ message: 'La nueva fecha es requerida' });
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    const nueva = new Date(nuevaFecha + 'T00:00:00');
    if (Number.isNaN(nueva.getTime())) return res.status(400).json({ message: 'Fecha inválida' });
    if (nueva <= hoy) return res.status(400).json({ message: 'La nueva fecha debe ser posterior a hoy' });

    const t = await db.transaction();
    try {
        const reserva = await Reserva.findOne({
            where: { id_reserva: id, persona_id },
            lock: Transaction.LOCK.UPDATE, transaction: t
        });
        if (!reserva) { await t.rollback(); return res.status(404).json({ message: 'Reserva no encontrada' }); }
        if (reserva.estado === 'cancelada') { await t.rollback(); return res.status(400).json({ message: 'La reserva está cancelada' }); }
        if (reserva.estado === 'confirmada') { await t.rollback(); return res.status(400).json({ message: 'La reserva ya está confirmada; no se puede cambiar la fecha' }); }

        // Fecha límite: sin penalidad solo hasta N días antes del evento actual
        const fechaActual = new Date(fechaAStr(reserva.fecha) + 'T00:00:00');
        const diasHastaEvento = Math.floor((fechaActual.getTime() - hoy.getTime()) / 86400000);
        if (diasHastaEvento < DIAS_LIMITE_CAMBIO_FECHA) {
            await t.rollback();
            return res.status(409).json({
                message: `El cambio de fecha sin penalidad solo está disponible hasta ${DIAS_LIMITE_CAMBIO_FECHA} días antes del evento.`,
                penalidad: true
            });
        }

        // Disponibilidad del salón en la nueva fecha (excluyendo esta reserva)
        const ocupada = await Reserva.findOne({
            where: {
                salon_id: reserva.salon_id,
                fecha: nuevaFecha,
                estado: { [Op.ne]: 'cancelada' },
                id_reserva: { [Op.ne]: reserva.id_reserva }
            },
            lock: Transaction.LOCK.UPDATE, transaction: t
        });
        if (ocupada) { await t.rollback(); return res.status(409).json({ message: 'El salón no está disponible en esa fecha' }); }

        const salon = await Salon.findByPk(reserva.salon_id, { transaction: t });
        let datos: any = {};
        try { datos = reserva.datos_evento ? JSON.parse(reserva.datos_evento) : {}; } catch { /* ignore */ }
        datos.fecha = nuevaFecha;
        const horas = horasDesdeDatosEvento(datos);
        const precioBase = Number(salon?.precio_alquiler) || 0;
        const monto_alquiler = calcularMontoAlquiler(precioBase, (salon as any)?.precios_config, nuevaFecha, horas);

        await reserva.update({ fecha: nuevaFecha, datos_evento: JSON.stringify(datos), monto_alquiler }, { transaction: t });

        // Si el evento ya existe (borrador privado o activado), sincronizar su fecha
        if (reserva.evento_id) {
            try { await Evento.update({ fecha: nuevaFecha as any }, { where: { id_evento: reserva.evento_id }, transaction: t }); } catch { /* best-effort */ }
        }

        await t.commit();

        // Vía A: si la reserva ya está en el calendar del dueño, mover el evento a la nueva fecha
        upsertEventoReserva(reserva).catch(() => {});

        let comision_cliente_porcentaje = 0;
        try {
            if ((salon as any)?.dueno_id) {
                const contrato = await Contrato.findOne({
                    where: { persona_id: (salon as any).dueno_id, estado: 'vigente', ambito: 'salon' },
                    attributes: ['comision_cliente_porcentaje']
                });
                if (contrato) comision_cliente_porcentaje = Number(contrato.comision_cliente_porcentaje);
            }
        } catch { /* sin comisión */ }

        return res.json({
            reserva: {
                id_reserva: reserva.id_reserva,
                fecha: nuevaFecha,
                monto_alquiler,
                monto_sena: +(monto_alquiler * PORCENTAJE_SENA).toFixed(2),
                comision_cliente_porcentaje,
                datos_evento: datos
            }
        });
    } catch (error: any) {
        await t.rollback();
        if (error.name === 'SequelizeUniqueConstraintError') {
            return res.status(409).json({ message: 'La fecha ya fue reservada por otro usuario. Elegí otra.' });
        }
        logger.error('[Reserva] Error al cambiar fecha', { error: error.message });
        return res.status(500).json({ message: 'Error al cambiar la fecha', error: error.message });
    }
};

// DELETE /api/reservas/:id  — elimina permanentemente una reserva cancelada
export const eliminarReservaCancelada: RequestHandler = async (req: Request, res: Response) => {
    const { id } = req.params;
    const persona_id = req.persona!.id_persona;
    try {
        const reserva = await Reserva.findOne({ where: { id_reserva: id, persona_id } });
        if (!reserva) {
            return res.status(404).json({ message: 'Reserva no encontrada' });
        }
        if (reserva.estado !== 'cancelada') {
            return res.status(400).json({ message: 'Solo se pueden eliminar reservas canceladas' });
        }
        await Orden.destroy({ where: { reserva_id: id } });
        await reserva.destroy();
        return res.json({ message: 'Reserva eliminada exitosamente' });
    } catch (error: any) {
        logger.error('[Reserva] Error al eliminar reserva cancelada', { error: error.message });
        return res.status(500).json({ message: 'Error al eliminar la reserva', error: error.message });
    }
};

// Suma lo efectivamente abonado por una reserva (órdenes aprobadas).
async function montoAbonadoDeReserva(reserva_id: number | string): Promise<number> {
    const ordenes = await Orden.findAll({
        where: { reserva_id, estado: 'aprobado' },
        attributes: ['monto_total'],
    });
    return ordenes.reduce((acc, o) => acc + (Number((o as any).monto_total) || 0), 0);
}

// Normaliza el motivo recibido; por defecto 'voluntaria'.
function parseMotivo(raw: any): MotivoCancelacion {
    return MOTIVOS_CANCELACION.includes(raw) ? raw : 'voluntaria';
}

// GET /api/reservas/:id/cancelacion-preview?motivo=voluntaria|fuerza_mayor|arrepentimiento
// Devuelve el cálculo de reembolso SIN cancelar, para mostrarlo antes de confirmar.
export const getCancelacionPreview: RequestHandler = async (req: Request, res: Response) => {
    const { id } = req.params;
    const persona_id = req.persona!.id_persona;
    const motivo = parseMotivo(req.query.motivo);
    try {
        const reserva = await Reserva.findOne({ where: { id_reserva: id, persona_id } });
        if (!reserva) return res.status(404).json({ message: 'Reserva no encontrada' });
        if (reserva.estado === 'cancelada') {
            return res.status(400).json({ message: 'La reserva ya está cancelada' });
        }

        const montoAbonado = await montoAbonadoDeReserva(id);
        // Reserva sin pago: no hay reembolso que calcular
        if (reserva.estado === 'pendiente_pago' || montoAbonado <= 0) {
            return res.json({
                requiere_reembolso: false,
                monto_abonado: montoAbonado,
                message: 'La reserva no tiene pagos: se cancela sin reembolso.',
            });
        }

        const reembolso = calcularReembolso({
            montoAbonado,
            fechaEvento: reserva.fecha as any,
            fechaCompra: (reserva as any).createdAt ?? null,
            motivo,
        });
        return res.json({ requiere_reembolso: true, ...reembolso });
    } catch (error: any) {
        return res.status(500).json({ message: 'Error al calcular el reembolso', error: error.message });
    }
};

// DELETE /api/reservas/:id/cancelar   (motivo por query o body)
// Cancela la reserva. Si estaba pagada, calcula el reembolso según la escala por
// anticipación y lo registra en datos_evento.cancelacion (el pago real es posterior).
export const cancelarReserva: RequestHandler = async (req: Request, res: Response) => {
    const { id } = req.params;
    const persona_id = req.persona!.id_persona;
    const motivo = parseMotivo(req.body?.motivo ?? req.query.motivo);
    try {
        const reserva = await Reserva.findOne({ where: { id_reserva: id, persona_id } });
        if (!reserva) {
            return res.status(404).json({ message: 'Reserva no encontrada' });
        }
        if (reserva.estado === 'cancelada') {
            return res.status(400).json({ message: 'La reserva ya está cancelada' });
        }

        const montoAbonado = await montoAbonadoDeReserva(id);
        let reembolso: ReturnType<typeof calcularReembolso> | null = null;
        const esPaga = montoAbonado > 0 && reserva.estado !== 'pendiente_pago';

        if (esPaga) {
            // Reserva pagada: aplicar escala por anticipación / fuerza mayor / arrepentimiento
            reembolso = calcularReembolso({
                montoAbonado,
                fechaEvento: reserva.fecha as any,
                fechaCompra: (reserva as any).createdAt ?? null,
                motivo,
            });
        }

        // Cancelar la reserva y todas sus órdenes para liberar cupos de servicios
        await reserva.update({ estado: 'cancelada' });
        await Orden.update({ estado: 'cancelado' }, { where: { reserva_id: id } });
        // Vía A: quitar el evento del Google Calendar del dueño (best-effort)
        borrarEventoReserva(reserva).catch(() => {});

        // Ejecutar el reembolso real vía MercadoPago (best-effort) sobre los pagos de la reserva
        let ejecucion: Awaited<ReturnType<typeof ejecutarReembolsoReserva>> | null = null;
        if (reembolso && reembolso.porcentaje_reembolso > 0) {
            try {
                ejecucion = await ejecutarReembolsoReserva(id, reembolso.porcentaje_reembolso);
            } catch (e: any) {
                logger.error('[Reserva] Error ejecutando reembolso MP', { reserva_id: id, error: e?.message });
            }
        }

        // Registrar la cancelación y el resultado de la ejecución en datos_evento (sin cambio de esquema)
        if (reembolso) {
            try {
                const datos = reserva.datos_evento ? JSON.parse(reserva.datos_evento) : {};
                datos.cancelacion = {
                    fecha: new Date().toISOString(),
                    ...reembolso,
                    // 'ejecutado' | 'parcial' | 'error' | 'sin_pagos' según el resultado real;
                    // 'no_corresponde' si el % es 0 (no hay nada que devolver).
                    reembolso_estado: reembolso.porcentaje_reembolso === 0 ? 'no_corresponde' : (ejecucion?.estado ?? 'pendiente'),
                    ejecucion: ejecucion ?? undefined,
                };
                await reserva.update({ datos_evento: JSON.stringify(datos) });
            } catch { /* si datos_evento no parsea, seguimos igual */ }

            logger.info('[Reserva] Cancelación con reembolso', {
                reserva_id: id, motivo,
                porcentaje: reembolso.porcentaje_reembolso,
                monto_reembolso: reembolso.monto_reembolso,
                ejecucion: ejecucion?.estado ?? 'pendiente',
            });
        }

        return res.json({
            message: 'Reserva cancelada exitosamente',
            requiere_reembolso: !!reembolso,
            reembolso,
            ejecucion,
        });
    } catch (error: any) {
        return res.status(500).json({ message: 'Error al cancelar reserva', error: error.message });
    }
};
