import { Request, Response, RequestHandler } from 'express'
import PedidoTorta from '../models/pedidoTorta'

// Campos editables del pedido (whitelist). El estado/pago/cambios se manejan
// en endpoints propios en features siguientes, pero se aceptan si vienen.
const CAMPOS = [
    'cliente_nombre', 'cliente_contacto',
    'fecha_evento', 'hora_entrega', 'modo_entrega',
    'personas', 'porciones', 'sabor', 'rellenos', 'cobertura',
    'colores', 'tematica', 'pisos', 'detalles_diseno', 'alergias',
    'estado', 'precio_total', 'sena_monto', 'sena_pagada',
    'fecha_limite_pago', 'fecha_limite_cambios', 'notas',
] as const

// fotos_referencia y los campos JSON se guardan serializados.
const tomarCampos = (body: any) => {
    const out: any = {}
    for (const k of CAMPOS) if (body[k] !== undefined) out[k] = body[k] === '' ? null : body[k]
    if (Array.isArray(body.fotos_referencia)) out.fotos_referencia = JSON.stringify(body.fotos_referencia)
    return out
}

// Devuelve el pedido con los campos JSON ya parseados para el front.
const serializar = (p: PedidoTorta) => {
    const j: any = p.toJSON()
    try { j.fotos_referencia = j.fotos_referencia ? JSON.parse(j.fotos_referencia) : [] } catch { j.fotos_referencia = [] }
    try { j.desglose_precio = j.desglose_precio ? JSON.parse(j.desglose_precio) : null } catch { j.desglose_precio = null }
    try { j.cambios_log = j.cambios_log ? JSON.parse(j.cambios_log) : [] } catch { j.cambios_log = [] }
    return j
}

// GET /api/pedidos-torta  → lista del proveedor autenticado
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

// GET /api/pedidos-torta/:id
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

// POST /api/pedidos-torta
export const crearPedidoTorta: RequestHandler = async (req: Request, res: Response) => {
    const proveedor_id = req.persona?.id_persona
    if (!proveedor_id) return res.status(401).json({ message: 'No autenticado' })
    if (!req.body?.cliente_nombre) return res.status(400).json({ message: 'El nombre del cliente es obligatorio' })
    try {
        const pedido = await PedidoTorta.create({ ...tomarCampos(req.body), proveedor_id })
        return res.status(201).json({ pedido: serializar(pedido) })
    } catch (error: any) {
        return res.status(500).json({ message: 'Error al crear el pedido', error: error.message })
    }
}

// PUT /api/pedidos-torta/:id
export const updatePedidoTorta: RequestHandler = async (req: Request, res: Response) => {
    const proveedor_id = req.persona?.id_persona
    try {
        const pedido = await PedidoTorta.findOne({ where: { id_pedido: req.params.id, proveedor_id } })
        if (!pedido) return res.status(404).json({ message: 'Pedido no encontrado' })
        await pedido.update(tomarCampos(req.body))
        return res.json({ pedido: serializar(pedido) })
    } catch (error: any) {
        return res.status(500).json({ message: 'Error al actualizar el pedido', error: error.message })
    }
}

// DELETE /api/pedidos-torta/:id
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
