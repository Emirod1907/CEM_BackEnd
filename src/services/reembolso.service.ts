// Motor de reembolso — escala por anticipación (Opción A / Ley 24.240).
// Función pura y testeable: dado el monto abonado, la fecha del evento, la fecha de
// compra y el motivo, calcula cuánto se reembolsa y cuánto se retiene.
//
// Ver documento de diseño: SPLIT_PAGOS_OPCION_A_BASES_Y_CONDICIONES.html

export type MotivoCancelacion = 'voluntaria' | 'fuerza_mayor' | 'arrepentimiento'

export const MOTIVOS_CANCELACION: MotivoCancelacion[] = ['voluntaria', 'fuerza_mayor', 'arrepentimiento']

// Ventana legal de arrepentimiento (art. 34 Ley 24.240 / art. 1110 CCyC): 10 días corridos.
export const DIAS_ARREPENTIMIENTO = 10

// Escala por anticipación para la cancelación voluntaria del consumidor.
// Se evalúa de mayor a menor: el primer tramo cuyo `min` de días se alcanza.
const TRAMOS_VOLUNTARIA = [
    { minDias: 60, pct: 100, label: '60 días o más' },
    { minDias: 30, pct: 80,  label: '30 a 59 días' },
    { minDias: 15, pct: 60,  label: '15 a 29 días' },
    { minDias: 7,  pct: 40,  label: '7 a 14 días' },
    { minDias: 0,  pct: 0,   label: 'Menos de 7 días' },
]

export interface ResultadoReembolso {
    motivo: MotivoCancelacion
    dias_antelacion: number
    porcentaje_reembolso: number   // 0..100
    monto_abonado: number
    monto_reembolso: number
    monto_retenido: number
    tramo: string                  // etiqueta legible del criterio aplicado
    aplica_arrepentimiento: boolean
}

const diasEntre = (desde: Date, hasta: Date): number =>
    Math.floor((hasta.getTime() - desde.getTime()) / 86_400_000)

const tramoVoluntario = (diasAntelacion: number) =>
    TRAMOS_VOLUNTARIA.find(t => diasAntelacion >= t.minDias) ?? TRAMOS_VOLUNTARIA[TRAMOS_VOLUNTARIA.length - 1]

export function calcularReembolso(params: {
    montoAbonado: number
    fechaEvento: Date | string
    fechaCompra?: Date | string | null
    motivo: MotivoCancelacion
    hoy?: Date
}): ResultadoReembolso {
    const hoy = params.hoy ?? new Date()
    const fechaEvento = new Date(params.fechaEvento)
    const diasAntelacion = diasEntre(hoy, fechaEvento)
    const monto = Math.max(0, Number(params.montoAbonado) || 0)

    let pct = 0
    let tramo = ''
    let aplicaArrepentimiento = false

    if (params.motivo === 'fuerza_mayor') {
        // Caso fortuito / fuerza mayor (art. 1730 CCyC): reembolso íntegro, sin retención.
        pct = 100
        tramo = 'Fuerza mayor / caso fortuito'
    } else if (params.motivo === 'arrepentimiento') {
        const fechaCompra = params.fechaCompra ? new Date(params.fechaCompra) : null
        const diasDesdeCompra = fechaCompra ? diasEntre(fechaCompra, hoy) : Number.POSITIVE_INFINITY
        // Válido si compró hace ≤10 días y el evento aún no ocurrió (prestación no iniciada).
        if (diasDesdeCompra <= DIAS_ARREPENTIMIENTO && diasAntelacion >= 0) {
            pct = 100
            tramo = `Derecho de arrepentimiento (dentro de ${DIAS_ARREPENTIMIENTO} días de la compra)`
            aplicaArrepentimiento = true
        } else {
            // Fuera de ventana → se resuelve por la escala de cancelación voluntaria.
            const t = tramoVoluntario(diasAntelacion)
            pct = t.pct
            tramo = `Fuera de la ventana de arrepentimiento · ${t.label}`
        }
    } else {
        const t = tramoVoluntario(diasAntelacion)
        pct = t.pct
        tramo = t.label
    }

    const montoReembolso = +(monto * pct / 100).toFixed(2)
    const montoRetenido = +(monto - montoReembolso).toFixed(2)

    return {
        motivo: params.motivo,
        dias_antelacion: diasAntelacion,
        porcentaje_reembolso: pct,
        monto_abonado: monto,
        monto_reembolso: montoReembolso,
        monto_retenido: montoRetenido,
        tramo,
        aplica_arrepentimiento: aplicaArrepentimiento,
    }
}
