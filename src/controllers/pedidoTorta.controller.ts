import { Request, Response, RequestHandler } from 'express'
import crypto from 'crypto'
import PedidoTorta from '../models/pedidoTorta'

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173'

// Campos escalares editables (whitelist).
const CAMPOS = [
    'cliente_nombre', 'cliente_contacto',
    'fecha_evento', 'hora_entrega', 'modo_entrega',
    'personas', 'porciones', 'sabor', 'rellenos', 'cobertura',
    'colores', 'tematica', 'pisos', 'detalles_diseno', 'alergias',
    'estado', 'precio_total', 'sena_monto', 'sena_pagada', 'monto_pagado',
    'fecha_limite_pago', 'fecha_limite_cambios', 'politica_cancelacion',
    'sena_reembolsable', 'notas',
] as const

const ESTADOS_VALIDOS = [
    'consulta', 'presupuestado', 'sena_pendiente', 'confirmado',
    'preparando', 'terminado', 'entregado', 'cancelado',
]

// Arma el objeto a persistir: campos escalares + los JSON serializados.
const tomarCampos = (body: any) => {
    const out: any = {}
    for (const k of CAMPOS) if (body[k] !== undefined) out[k] = body[k] === '' ? null : body[k]
    if (out.estado && !ESTADOS_VALIDOS.includes(out.estado)) delete out.estado
    if (Array.isArray(body.fotos_referencia)) out.fotos_referencia = JSON.stringify(body.fotos_referencia)
    if (Array.isArray(body.desglose_precio)) {
        out.desglose_precio = JSON.stringify(body.desglose_precio)
        // El precio total se deriva de los componentes del desglose (feature 8).
        const total = body.desglose_precio.reduce((a: number, c: any) => a + (Number(c?.monto) || 0), 0)
        if (out.precio_total === undefined) out.precio_total = +total.toFixed(2)
    }
    if (Array.isArray(body.cambios_log)) out.cambios_log = JSON.stringify(body.cambios_log)
    return out
}

const parseJson = (v: any, fallback: any) => {
    try { return v ? JSON.parse(v) : fallback } catch { return fallback }
}

// Serializa para el proveedor (dueño): incluye todo.
const serializar = (p: PedidoTorta) => {
    const j: any = p.toJSON()
    j.fotos_referencia = parseJson(j.fotos_referencia, [])
    j.desglose_precio = parseJson(j.desglose_precio, [])
    j.cambios_log = parseJson(j.cambios_log, [])
    j.saldo = Math.max(0, (Number(j.precio_total) || 0) - (Number(j.monto_pagado) || 0))
    j.link_publico = j.token_publico ? `${FRONTEND_URL}/pedido-torta/${j.token_publico}` : null
    return j
}

// Serializa para el cliente (vista pública): solo lo que le corresponde ver.
const serializarPublico = (p: PedidoTorta) => {
    const j: any = p.toJSON()
    const total = Number(j.precio_total) || 0
    const pagado = Number(j.monto_pagado) || 0
    return {
        cliente_nombre: j.cliente_nombre,
        fecha_evento: j.fecha_evento,
        hora_entrega: j.hora_entrega,
        modo_entrega: j.modo_entrega,
        personas: j.personas,
        porciones: j.porciones,
        pisos: j.pisos,
        sabor: j.sabor,
        rellenos: j.rellenos,
        cobertura: j.cobertura,
        colores: j.colores,
        tematica: j.tematica,
        detalles_diseno: j.detalles_diseno,
        alergias: j.alergias,
        fotos_referencia: parseJson(j.fotos_referencia, []),
        estado: j.estado,
        precio_total: total,
        monto_pagado: pagado,
        saldo: Math.max(0, total - pagado),
        fecha_limite_pago: j.fecha_limite_pago,
        fecha_limite_cambios: j.fecha_limite_cambios,
        politica_cancelacion: j.politica_cancelacion,
        sena_reembolsable: j.sena_reembolsable,
        desglose_precio: parseJson(j.desglose_precio, []),
        confirmado_cliente: j.confirmado_cliente,
        confirmado_cliente_fecha: j.confirmado_cliente_fecha,
    }
}

const nuevoToken = () => crypto.randomUUID().replace(/-/g, '')

// ── GET /api/pedidos-torta ──
export const getMisPedidosTorta: RequestHandler = async (req: Request, res: Response) => {
    const proveedor_id = req.persona?.id_persona
    if (!proveedor_id) return res.status(401).json({ message: 'No autenticado' })
    try {
        const pedidos = await PedidoTorta.findAll({
            where: { proveedor_id },
            order: [['fecha_evento', 'ASC'], ['id_pedido', 'DESC']],
        })
        return res.json({ pedidos: pedidos.map(serializar) })
    } catch (error: any) {
        return res.status(500).json({ message: 'Error al obtener pedidos', error: error.message })
    }
}

// ── GET /api/pedidos-torta/:id ──
export const getPedidoTorta: RequestHandler = async (req: Request, res: Response) => {
    const proveedor_id = req.persona?.id_persona
    try {
        const pedido = await PedidoTorta.findOne({ where: { id_pedido: req.params.id, proveedor_id } })
        if (!pedido) return res.status(404).json({ message: 'Pedido no encontrado' })
        return res.json({ pedido: serializar(pedido) })
    } catch (error: any) {
        return res.status(500).json({ message: 'Error al obtener el pedido', error: error.message })
    }
}

// ── POST /api/pedidos-torta ──
export const crearPedidoTorta: RequestHandler = async (req: Request, res: Response) => {
    const proveedor_id = req.persona?.id_persona
    if (!proveedor_id) return res.status(401).json({ message: 'No autenticado' })
    if (!req.body?.cliente_nombre) return res.status(400).json({ message: 'El nombre del cliente es obligatorio' })
    try {
        const pedido = await PedidoTorta.create({
            ...tomarCampos(req.body),
            proveedor_id,
            token_publico: nuevoToken(),
        })
        return res.status(201).json({ pedido: serializar(pedido) })
    } catch (error: any) {
        return res.status(500).json({ message: 'Error al crear el pedido', error: error.message })
    }
}

// ── PUT /api/pedidos-torta/:id ──
export const updatePedidoTorta: RequestHandler = async (req: Request, res: Response) => {
    const proveedor_id = req.persona?.id_persona
    try {
        const pedido = await PedidoTorta.findOne({ where: { id_pedido: req.params.id, proveedor_id } })
        if (!pedido) return res.status(404).json({ message: 'Pedido no encontrado' })
        const campos = tomarCampos(req.body)
        // Al editar los datos del pedido, el cliente debe volver a confirmar.
        if (Object.keys(campos).some(k => k !== 'estado' && k !== 'sena_pagada' && k !== 'monto_pagado')) {
            campos.confirmado_cliente = false
            campos.confirmado_cliente_fecha = null
        }
        if (!pedido.token_publico) campos.token_publico = nuevoToken()
        await pedido.update(campos)
        return res.json({ pedido: serializar(pedido) })
    } catch (error: any) {
        return res.status(500).json({ message: 'Error al actualizar el pedido', error: error.message })
    }
}

// ── POST /api/pedidos-torta/:id/cambio ── (feature 5: cambios de último momento)
export const agregarCambioPedido: RequestHandler = async (req: Request, res: Response) => {
    const proveedor_id = req.persona?.id_persona
    const { descripcion, costo_extra, resultado } = req.body || {}
    if (!descripcion) return res.status(400).json({ message: 'La descripción del cambio es obligatoria' })
    try {
        const pedido = await PedidoTorta.findOne({ where: { id_pedido: req.params.id, proveedor_id } })
        if (!pedido) return res.status(404).json({ message: 'Pedido no encontrado' })
        const log = parseJson(pedido.cambios_log, [])
        log.unshift({
            fecha: new Date().toISOString(),
            descripcion,
            costo_extra: Number(costo_extra) || 0,
            resultado: resultado || 'aplicado', // 'aplicado' | 'con_costo' | 'rechazado'
        })
        const extra = Number(costo_extra) || 0
        const patch: any = { cambios_log: JSON.stringify(log) }
        // Si el cambio tiene costo extra, se suma al total del pedido.
        if (extra > 0) patch.precio_total = +((Number(pedido.precio_total) || 0) + extra).toFixed(2)
        await pedido.update(patch)
        return res.json({ pedido: serializar(pedido) })
    } catch (error: any) {
        return res.status(500).json({ message: 'Error al registrar el cambio', error: error.message })
    }
}

// ── DELETE /api/pedidos-torta/:id ──
export const deletePedidoTorta: RequestHandler = async (req: Request, res: Response) => {
    const proveedor_id = req.persona?.id_persona
    try {
        const pedido = await PedidoTorta.findOne({ where: { id_pedido: req.params.id, proveedor_id } })
        if (!pedido) return res.status(404).json({ message: 'Pedido no encontrado' })
        await pedido.destroy()
        return res.json({ ok: true })
    } catch (error: any) {
        return res.status(500).json({ message: 'Error al eliminar el pedido', error: error.message })
    }
}

// ── GET /api/pedidos-torta/publico/:token ── (feature 10: vista del cliente, sin auth)
export const getPedidoPublico: RequestHandler = async (req: Request, res: Response) => {
    try {
        const pedido = await PedidoTorta.findOne({ where: { token_publico: req.params.token } })
        if (!pedido) return res.status(404).json({ message: 'Pedido no encontrado' })
        return res.json({ pedido: serializarPublico(pedido) })
    } catch (error: any) {
        return res.status(500).json({ message: 'Error al obtener el pedido', error: error.message })
    }
}

// ── POST /api/pedidos-torta/publico/:token/confirmar ── (feature 11: el cliente confirma)
export const confirmarPedidoPublico: RequestHandler = async (req: Request, res: Response) => {
    try {
        const pedido = await PedidoTorta.findOne({ where: { token_publico: req.params.token } })
        if (!pedido) return res.status(404).json({ message: 'Pedido no encontrado' })
        await pedido.update({ confirmado_cliente: true, confirmado_cliente_fecha: new Date() })
        return res.json({ pedido: serializarPublico(pedido) })
    } catch (error: any) {
        return res.status(500).json({ message: 'Error al confirmar el pedido', error: error.message })
    }
}
