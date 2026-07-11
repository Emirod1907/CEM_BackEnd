import { Request, Response, RequestHandler } from 'express'
import Evento from '../models/evento'
import Reserva from '../models/reserva'
import Orden from '../models/orden'
import Persona from '../models/persona'
import Salon from '../models/salon'
import Contrato from '../models/contrato'
import Invitacion from '../models/invitacion'
import InvitadoConfirmado from '../models/invitadoConfirmado'
import MovimientoPozo from '../models/movimientoPozo'
import db from '../db/connection'
import { logger } from '../libs/logger'

// Solo el creador del evento puede operar su pozo
async function getEventoDelOrganizador(evento_id: string | number, persona_id: number) {
    const evento = await Evento.findByPk(evento_id)
    if (!evento) return { error: 404, message: 'Evento no encontrado', evento: null }
    if ((evento as any).creado_por !== persona_id) {
        return { error: 403, message: 'Solo el organizador del evento puede ver su pozo', evento: null }
    }
    return { error: null, message: '', evento }
}

const sumar = (movs: MovimientoPozo[], tipo: string) =>
    +movs.filter(m => m.tipo === tipo).reduce((acc, m) => acc + Number(m.monto), 0).toFixed(2)

// GET /api/eventos/:id/pozo — resumen del pozo común del evento
export const getPozo: RequestHandler = async (req: Request, res: Response) => {
    const { id } = req.params
    const persona = (req as any).persona

    try {
        const { error, message, evento } = await getEventoDelOrganizador(id, persona.id_persona)
        if (error) return res.status(error).json({ message })

        const movimientos = await MovimientoPozo.findAll({
            where: { evento_id: id },
            order: [['fecha', 'DESC']]
        })

        const total_recaudado = sumar(movimientos, 'ingreso_entrada')
        const total_pagado_costos = sumar(movimientos, 'pago_costo')
        const total_retirado = sumar(movimientos, 'retiro_ganancia')
        const saldo = +(total_recaudado - total_pagado_costos - total_retirado).toFixed(2)

        // Nombres de las personas involucradas en los movimientos
        const personaIds = [...new Set(movimientos.map(m => m.persona_id).filter(Boolean))] as number[]
        const personas = personaIds.length > 0
            ? await Persona.findAll({ where: { id_persona: personaIds }, attributes: ['id_persona', 'nombre', 'apellido', 'email'] })
            : []
        const personaMap = new Map(personas.map(p => [p.id_persona, p]))

        const movimientosOut = movimientos.map(m => {
            const p = m.persona_id ? personaMap.get(m.persona_id) : null
            return {
                id_movimiento: m.id_movimiento,
                tipo: m.tipo,
                monto: Number(m.monto),
                descripcion: m.descripcion,
                fecha: m.fecha,
                orden_id: m.orden_id,
                persona: p ? { nombre: (p as any).nombre, apellido: (p as any).apellido, email: (p as any).email } : null
            }
        })

        // Estado de pago de cada invitación del evento (quiénes pagaron su entrada)
        const invitaciones = await Invitacion.findAll({
            where: { evento_id: id },
            include: [{ model: InvitadoConfirmado, as: 'InvitadosConfirmados' }]
        })
        const ordenIds = [...new Set(
            invitaciones.flatMap(inv => ((inv as any).InvitadosConfirmados || []).map((ic: any) => ic.orden_mp_id)).filter(Boolean)
        )] as number[]
        const ordenes = ordenIds.length > 0
            ? await Orden.findAll({ where: { id_orden: ordenIds }, attributes: ['id_orden', 'estado', 'monto_total'] })
            : []
        const ordenMap = new Map(ordenes.map(o => [o.id_orden, o]))

        const invitacionesOut = invitaciones.map(inv => {
            const invitados = ((inv as any).InvitadosConfirmados || []) as any[]
            const ordenId = invitados.find(ic => ic.orden_mp_id)?.orden_mp_id || null
            const orden = ordenId ? ordenMap.get(ordenId) : null
            return {
                id_invitacion: inv.id_invitacion,
                nombre_invitado: inv.nombre_invitado,
                num_invitados: inv.num_invitados,
                invitados: invitados.map(ic => ic.nombre),
                estado: inv.estado,
                pagada: !!orden && orden.estado === 'aprobado',
                monto: orden && orden.estado === 'aprobado' ? Number(orden.monto_total) : 0,
            }
        })

        // Contexto del costo del evento (lo que el organizador pagó / debe)
        const reserva = await Reserva.findOne({ where: { evento_id: id } })
        let costo = null
        if (reserva) {
            const ordenesOrg = await Orden.findAll({
                where: { reserva_id: reserva.id_reserva, tipo: 'organizador', estado: 'aprobado' },
                attributes: ['monto_total', 'tipo_pago']
            })
            // Comisión del cliente (contrato vigente del dueño del salón). El alquiler
            // se muestra CON comisión incorporada, igual que en el resto del flujo.
            let comisionClientePct = 0
            try {
                const salonData = await Salon.findByPk(reserva.salon_id, { attributes: ['dueno_id'] })
                const duenoId = (salonData as any)?.dueno_id
                if (duenoId) {
                    const contrato = await Contrato.findOne({
                        where: { persona_id: Number(duenoId), estado: 'vigente', ambito: 'salon' },
                        attributes: ['comision_cliente_porcentaje'],
                    })
                    if (contrato) comisionClientePct = Number(contrato.comision_cliente_porcentaje)
                }
            } catch { /* sin contrato → sin comisión */ }
            const factorComision = 1 + comisionClientePct / 100
            costo = {
                monto_alquiler: +((Number(reserva.monto_alquiler) || 0) * factorComision).toFixed(2),
                estado_reserva: reserva.estado,
                pagado_organizador: +ordenesOrg.reduce((acc, o) => acc + Number(o.monto_total), 0).toFixed(2),
                tipo_pago: ordenesOrg.find(o => o.tipo_pago === 'total') ? 'total' : (ordenesOrg.length > 0 ? 'seña' : null),
            }
        }

        return res.json({
            evento: { id_evento: (evento as any).id_evento, nombre: (evento as any).nombre, precio: Number((evento as any).precio) || 0 },
            total_recaudado,
            total_pagado_costos,
            total_retirado,
            saldo,
            costo,
            movimientos: movimientosOut,
            invitaciones: invitacionesOut,
        })
    } catch (error: any) {
        logger.error('[Pozo] Error al obtener pozo', { error: error.message })
        return res.status(500).json({ message: 'Error al obtener el pozo', error: error.message })
    }
}

// POST /api/eventos/:id/pozo/movimiento — registra un egreso del pozo
// body: { tipo: 'pago_costo' | 'retiro_ganancia', monto, descripcion? }
export const crearMovimientoPozo: RequestHandler = async (req: Request, res: Response) => {
    const { id } = req.params
    const { tipo, monto, descripcion } = req.body
    const persona = (req as any).persona

    if (!['pago_costo', 'retiro_ganancia'].includes(tipo)) {
        return res.status(400).json({ message: "tipo debe ser 'pago_costo' o 'retiro_ganancia'" })
    }
    const montoNum = Number(monto)
    if (!(montoNum > 0)) {
        return res.status(400).json({ message: 'El monto debe ser mayor a 0' })
    }

    try {
        const { error, message } = await getEventoDelOrganizador(id, persona.id_persona)
        if (error) return res.status(error).json({ message })

        const resultado = await db.transaction(async (t) => {
            const movimientos = await MovimientoPozo.findAll({
                where: { evento_id: id },
                transaction: t,
                lock: t.LOCK.UPDATE
            })
            const saldo = +(
                sumar(movimientos, 'ingreso_entrada')
                - sumar(movimientos, 'pago_costo')
                - sumar(movimientos, 'retiro_ganancia')
            ).toFixed(2)

            if (montoNum > saldo) {
                return { ok: false as const, saldo }
            }

            const mov = await MovimientoPozo.create({
                evento_id: Number(id),
                tipo,
                monto: +montoNum.toFixed(2),
                descripcion: descripcion?.toString().slice(0, 300) ||
                    (tipo === 'pago_costo' ? 'Aplicado al costo del evento' : 'Retiro de ganancia del organizador'),
                persona_id: persona.id_persona,
            }, { transaction: t })

            return { ok: true as const, saldo: +(saldo - montoNum).toFixed(2), mov }
        })

        if (!resultado.ok) {
            return res.status(400).json({ message: `Fondos insuficientes en el pozo (saldo: $${resultado.saldo.toLocaleString('es-AR')})` })
        }

        logger.info('[Pozo] Egreso registrado', { evento_id: id, tipo, monto: montoNum, persona_id: persona.id_persona })
        return res.status(201).json({
            message: tipo === 'pago_costo' ? 'Fondos aplicados al costo del evento' : 'Retiro registrado correctamente',
            saldo: resultado.saldo,
        })
    } catch (error: any) {
        logger.error('[Pozo] Error al crear movimiento', { error: error.message })
        return res.status(500).json({ message: 'Error al registrar el movimiento', error: error.message })
    }
}
