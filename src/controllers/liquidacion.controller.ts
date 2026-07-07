import { RequestHandler } from 'express'
import OrdenDesglose from '../models/ordenDesglose'
import Factura from '../models/factura'
import Orden from '../models/orden'
import Reserva from '../models/reserva'
import Salon from '../models/salon'
import Persona from '../models/persona'
import { emitirFactura, ArcaError } from '../services/arca.service'
import { logger } from '../libs/logger'

// ── Filtrado de campos de desglose por rol ─────────────────────────────────────
// Admin: todo el desglose
// Proveedor: precio_base (monto_bruto) + neto a cobrar + su propio % — NUNCA la comisión del cliente
// Cliente: N/A (estos endpoints son solo admin/proveedor)
function filtrarDesglose(d: OrdenDesglose, rol: string): Record<string, any> {
    const base = {
        id_desglose:        d.id_desglose,
        orden_id:           d.orden_id,
        reserva_id:         d.reserva_id,
        monto_bruto:        Number(d.monto_bruto),
        monto_neto_proveedor: Number(d.monto_neto_proveedor),
        estado_liquidacion: d.estado_liquidacion,
        fecha:              d.fecha,
    }

    if (rol === 'admin') {
        return {
            ...base,
            comision_cliente_porcentaje:  Number(d.comision_cliente_porcentaje),
            monto_comision_cliente:       Number(d.monto_comision_cliente),
            comision_proveedor_porcentaje: Number(d.comision_proveedor_porcentaje),
            monto_comision_proveedor:     Number(d.monto_comision_proveedor),
            factura_id: d.factura_id,
        }
    }

    // Proveedor: ve su neto y su propio %, NO el markup del cliente
    return {
        ...base,
        comision_proveedor_porcentaje: Number(d.comision_proveedor_porcentaje),
        monto_comision_proveedor:      Number(d.monto_comision_proveedor),
    }
}

function rolDesde(req: any): string {
    return req.persona?.Rol?.nombre ?? req.persona?.rol ?? 'desconocido'
}

// ── GET /api/admin/liquidaciones ──────────────────────────────────────────────
export const getLiquidaciones: RequestHandler = async (req: any, res, next) => {
    try {
        const { estado } = req.query
        const where: any = {}
        if (estado) where.estado_liquidacion = estado

        const desgloses = await OrdenDesglose.findAll({
            where,
            order: [['fecha', 'DESC']],
        })

        const ordenIds   = desgloses.map(d => d.orden_id)
        const reservaIds = desgloses.map(d => d.reserva_id).filter(Boolean) as number[]

        const [ordenes, reservas] = await Promise.all([
            Orden.findAll({
                where: { id_orden: ordenIds },
                attributes: ['id_orden', 'persona_id', 'tipo_pago', 'fecha_creacion'],
            }),
            reservaIds.length > 0
                ? Reserva.findAll({
                    where: { id_reserva: reservaIds },
                    include: [{ model: Salon, as: 'Salon', attributes: ['nombre', 'dueno_id'] }],
                    attributes: ['id_reserva', 'salon_id', 'fecha'],
                  })
                : Promise.resolve([]),
        ])

        const ordenMap   = new Map(ordenes.map(o => [o.id_orden, o]))
        const reservaMap = new Map(reservas.map(r => [r.id_reserva, r]))
        const rol        = rolDesde(req)

        // Estado de conexión MercadoPago de los dueños de salón (beneficiarios de la liquidación)
        const duenoIds = [...new Set(reservas.map(r => (r as any).Salon?.dueno_id).filter(Boolean))] as number[]
        const duenos = duenoIds.length > 0
            ? await Persona.findAll({ where: { id_persona: duenoIds }, attributes: ['id_persona', 'nombre', 'apellido', 'mp_access_token', 'mp_user_id'] })
            : []
        const duenoMap = new Map(duenos.map(p => [p.id_persona, p]))

        const resultado = desgloses.map(d => {
            const reserva = d.reserva_id ? (reservaMap.get(d.reserva_id) as any) : null
            const duenoId = reserva ? (reserva as any).Salon?.dueno_id : null
            const dueno   = duenoId ? (duenoMap.get(duenoId) as any) : null
            return {
                ...filtrarDesglose(d, rol),
                fecha_liquidacion: (d as any).fecha_liquidacion ?? null,
                beneficiario_mp_user_id: (d as any).beneficiario_mp_user_id ?? null,
                orden:   ordenMap.get(d.orden_id)?.toJSON() ?? null,
                reserva: reserva?.toJSON() ?? null,
                beneficiario: dueno ? {
                    persona_id: dueno.id_persona,
                    nombre: `${dueno.nombre} ${dueno.apellido}`,
                    mp_conectado: !!dueno.mp_access_token,
                    mp_user_id: dueno.mp_user_id ?? null,
                } : null,
            }
        })

        res.json({ liquidaciones: resultado })
    } catch (err) {
        next(err)
    }
}

// ── GET /api/admin/liquidaciones/proveedor/:persona_id ────────────────────────
export const getLiquidacionProveedor: RequestHandler = async (req: any, res, next) => {
    try {
        const { persona_id } = req.params
        const rol = rolDesde(req)

        const ordenes = await Orden.findAll({
            where: { persona_id, tipo: 'organizador', estado: 'aprobado' },
            attributes: ['id_orden'],
        })
        const ordenIds = ordenes.map(o => o.id_orden)

        if (ordenIds.length === 0) {
            res.json({ persona_id: Number(persona_id), liquidaciones: [] })
            return
        }

        const desgloses = await OrdenDesglose.findAll({
            where: { orden_id: ordenIds },
            order: [['fecha', 'DESC']],
        })

        res.json({
            persona_id:   Number(persona_id),
            liquidaciones: desgloses.map(d => filtrarDesglose(d, rol)),
        })
    } catch (err) {
        next(err)
    }
}

// ── POST /api/admin/facturas/emitir/:orden_id ─────────────────────────────────
export const emitirFacturaHandler: RequestHandler = async (req, res, next) => {
    try {
        const { orden_id } = req.params

        // Verificar que la orden existe y tiene desglose
        const orden = await Orden.findByPk(orden_id)
        if (!orden) {
            res.status(404).json({ message: 'Orden no encontrada' })
            return
        }

        const desglose = await OrdenDesglose.findOne({ where: { orden_id } })
        if (!desglose) {
            res.status(404).json({ message: 'Esta orden no tiene desglose de comisión registrado' })
            return
        }

        // Idempotencia: si ya fue facturado, devolver la factura existente
        const facturaExistente = await Factura.findOne({ where: { orden_id } })
        if (facturaExistente && facturaExistente.estado === 'emitida') {
            res.json({ ok: true, ya_existia: true, factura: facturaExistente.toJSON() })
            return
        }

        const { cuit_receptor, razon_social_receptor, domicilio_receptor } = req.body as any
        const datos_receptor = JSON.stringify({ cuit_receptor, razon_social_receptor, domicilio_receptor })

        // Crear o reutilizar factura en estado 'pendiente'
        const factura = facturaExistente ?? await Factura.create({
            orden_id: Number(orden_id),
            tipo_comprobante: 'C',
            punto_venta: 1,
            monto: desglose.monto_neto_proveedor,
            estado: 'pendiente',
            datos_receptor,
        })

        try {
            const resultado = await emitirFactura({
                orden_id:                Number(orden_id),
                cuit_receptor:           cuit_receptor ?? '00000000000',
                razon_social_receptor,
                domicilio_receptor,
                monto:                   Number(desglose.monto_neto_proveedor),
                tipo_comprobante:        'C',
                punto_venta:             1,
                concepto:                2,
            })

            await factura.update({
                cae:               resultado.cae,
                cae_vencimiento:   new Date(resultado.cae_vencimiento),
                numero_comprobante: resultado.numero_comprobante,
                fecha_emision:     new Date(),
                xml_respuesta:     resultado.xml_respuesta ?? null,
                estado:            'emitida',
            })
            await desglose.update({ estado_liquidacion: 'facturado', factura_id: factura.id_factura })

            res.json({ ok: true, factura: factura.toJSON() })
        } catch (arcaErr) {
            const errorMsg = arcaErr instanceof ArcaError
                ? `[${arcaErr.code}] ${arcaErr.message}`
                : String(arcaErr)

            await factura.update({ estado: 'error', error_detalle: errorMsg })
            logger.warn('[Liquidacion] Error ARCA al emitir factura', { orden_id, error: errorMsg })

            if (arcaErr instanceof ArcaError) {
                res.status(501).json({ message: arcaErr.message, code: (arcaErr as ArcaError).code })
            } else {
                next(arcaErr)
            }
        }
    } catch (err) {
        next(err)
    }
}

// ── POST /api/admin/liquidaciones/:orden_id/liquidar ──────────────────────────
// Ejecuta la liquidación (settlement) del neto del vendedor: marca el desglose como
// 'liquidado', registra la fecha y el beneficiario (collector_id del dueño si conectó
// su MercadoPago). El pago real se coordina contra la cuenta MP conectada del vendedor.
export const liquidarDesglose: RequestHandler = async (req, res, next) => {
    try {
        const { orden_id } = req.params
        const desglose = await OrdenDesglose.findOne({ where: { orden_id } })
        if (!desglose) {
            res.status(404).json({ message: 'Esta orden no tiene desglose de liquidación' })
            return
        }
        if (desglose.estado_liquidacion !== 'pendiente') {
            res.json({ ok: true, ya_liquidado: true, desglose: desglose.toJSON() })
            return
        }

        // Resolver el beneficiario (dueño del salón) y su conexión MercadoPago
        let beneficiario_mp_user_id: string | null = null
        let mp_conectado = false
        if (desglose.reserva_id) {
            const reserva = await Reserva.findByPk(desglose.reserva_id, { attributes: ['salon_id'] })
            if (reserva) {
                const salon = await Salon.findByPk((reserva as any).salon_id, { attributes: ['dueno_id'] })
                if ((salon as any)?.dueno_id) {
                    const dueno = await Persona.findByPk((salon as any).dueno_id, { attributes: ['mp_access_token', 'mp_user_id'] })
                    mp_conectado = !!(dueno as any)?.mp_access_token
                    beneficiario_mp_user_id = (dueno as any)?.mp_user_id ?? null
                }
            }
        }

        await desglose.update({
            estado_liquidacion: 'liquidado',
            fecha_liquidacion: new Date(),
            beneficiario_mp_user_id,
        })
        logger.info('[Liquidacion] Desglose liquidado', {
            orden_id, monto_neto: desglose.monto_neto_proveedor, mp_conectado, beneficiario_mp_user_id,
        })

        res.json({ ok: true, mp_conectado, desglose: desglose.toJSON() })
    } catch (err) {
        next(err)
    }
}
