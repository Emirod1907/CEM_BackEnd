// Ejecución real de reembolsos vía MercadoPago (PaymentRefund).
// Devuelve a cada pago aprobado de la reserva el porcentaje `pct` de su monto.
// El cálculo del porcentaje lo hace reembolso.service.ts (escala por anticipación).

import { MercadoPagoConfig, PaymentRefund } from 'mercadopago'
import { Op } from 'sequelize'
import { getMpCredentials } from '../config/mercadopago'
import Orden from '../models/orden'
import { logger } from '../libs/logger'

const mpClient = () => new MercadoPagoConfig({ accessToken: getMpCredentials().accessToken })

export interface DetalleRefund {
    orden_id: number
    payment_id: string
    monto: number
    ok: boolean
    refund_id?: number
    error?: string
}

export interface ResultadoEjecucionReembolso {
    estado: 'ejecutado' | 'parcial' | 'error' | 'sin_pagos'
    monto_reembolsado: number
    detalles: DetalleRefund[]
}

// Ejecuta el reembolso sobre TODAS las órdenes de la reserva que tengan un pago real
// (mp_payment_id), devolviendo pct% del monto de cada una.
export async function ejecutarReembolsoReserva(
    reserva_id: number | string,
    pct: number,
): Promise<ResultadoEjecucionReembolso> {
    if (pct <= 0) {
        return { estado: 'sin_pagos', monto_reembolsado: 0, detalles: [] }
    }

    const ordenes = await Orden.findAll({
        where: { reserva_id, mp_payment_id: { [Op.ne]: null } } as any,
    })
    if (ordenes.length === 0) {
        return { estado: 'sin_pagos', monto_reembolsado: 0, detalles: [] }
    }

    const refundClient = new PaymentRefund(mpClient())
    const detalles: DetalleRefund[] = []
    let totalReembolsado = 0
    let algunOk = false
    let algunError = false

    for (const orden of ordenes) {
        const paymentId = String((orden as any).mp_payment_id)
        const montoOrden = Number((orden as any).monto_total) || 0
        const montoRefund = +(montoOrden * pct / 100).toFixed(2)
        if (montoRefund <= 0) continue

        try {
            // pct 100 → refund total (sin amount); pct parcial → refund por monto
            const body = pct >= 100 ? {} : { amount: montoRefund }
            const resp: any = await refundClient.create({ payment_id: Number(paymentId), body } as any)
            detalles.push({
                orden_id: (orden as any).id_orden,
                payment_id: paymentId,
                monto: montoRefund,
                ok: true,
                refund_id: resp?.id,
            })
            totalReembolsado += montoRefund
            algunOk = true
        } catch (err: any) {
            const error = err?.message || String(err)
            detalles.push({ orden_id: (orden as any).id_orden, payment_id: paymentId, monto: montoRefund, ok: false, error })
            algunError = true
            logger.warn('[Reembolso MP] Falló el refund', { reserva_id, payment_id: paymentId, error })
        }
    }

    const estado: ResultadoEjecucionReembolso['estado'] =
        algunOk && algunError ? 'parcial' : algunOk ? 'ejecutado' : 'error'

    logger.info('[Reembolso MP] Ejecución de reembolso', { reserva_id, pct, estado, total: totalReembolsado })
    return { estado, monto_reembolsado: +totalReembolsado.toFixed(2), detalles }
}
