import { Router } from 'express'
import authRequired from '../middlewares/validateToken'
import {
    getMisPedidosTorta,
    getPedidoTorta,
    crearPedidoTorta,
    updatePedidoTorta,
    deletePedidoTorta,
} from '../controllers/pedidoTorta.controller'

const router = Router()

router.get('/', authRequired, getMisPedidosTorta)
router.get('/:id', authRequired, getPedidoTorta)
router.post('/', authRequired, crearPedidoTorta)
router.put('/:id', authRequired, updatePedidoTorta)
router.delete('/:id', authRequired, deletePedidoTorta)

export default router
