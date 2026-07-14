import { Router } from 'express'
import authRequired from '../middlewares/validateToken'
import {
    getMisPedidosTorta,
    getPedidoTorta,
    crearPedidoTorta,
    updatePedidoTorta,
    agregarCambioPedido,
    deletePedidoTorta,
    getPedidoPublico,
    confirmarPedidoPublico,
} from '../controllers/pedidoTorta.controller'

const router = Router()

// ── Público (vista del cliente, sin auth) — antes de las rutas con :id ──
router.get('/publico/:token', getPedidoPublico)
router.post('/publico/:token/confirmar', confirmarPedidoPublico)

// ── Proveedor (baker) autenticado ──
router.get('/', authRequired, getMisPedidosTorta)
router.get('/:id', authRequired, getPedidoTorta)
router.post('/', authRequired, crearPedidoTorta)
router.put('/:id', authRequired, updatePedidoTorta)
router.post('/:id/cambio', authRequired, agregarCambioPedido)
router.delete('/:id', authRequired, deletePedidoTorta)

export default router
