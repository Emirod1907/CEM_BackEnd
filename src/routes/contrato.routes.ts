import { Router } from 'express'
import authRequired from '../middlewares/validateToken'
import {
    getTerminosActuales,
    aceptarContrato,
    getMiContrato,
} from '../controllers/contrato.controller'

const router = Router()

// Público: devuelve T&C vigentes, comisión y hash para mostrar al proveedor antes de aceptar
router.get('/terminos-actuales', getTerminosActuales)

// Requiere auth: el proveedor acepta el contrato
router.post('/aceptar', authRequired, aceptarContrato)

// Requiere auth: devuelve el contrato vigente del usuario logueado
router.get('/mi-contrato', authRequired, getMiContrato)

export default router
