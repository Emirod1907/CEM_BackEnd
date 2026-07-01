import { Router } from 'express'
import authRequired from '../middlewares/validateToken'
import { getComisionVigente } from '../controllers/comision.controller'

const router = Router()

// Endpoint público-auth: lo usa Feature 1 al generar contratos nuevos
router.get('/vigente/:tipo_perfil', authRequired, getComisionVigente)

export default router
