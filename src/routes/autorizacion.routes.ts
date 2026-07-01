import { Router } from 'express'
import authRequired from '../middlewares/validateToken'
import { solicitarAutorizacion } from '../controllers/autorizacion.controller'

const router = Router()

// Cualquier usuario autenticado puede solicitar una autorización excepcional
router.post('/solicitar', authRequired, solicitarAutorizacion)

export default router
