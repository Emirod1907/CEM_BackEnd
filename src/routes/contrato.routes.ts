import { Router } from 'express'
import authRequired, { authOptional } from '../middlewares/validateToken'
import {
    getTerminosActuales,
    aceptarContrato,
    getMiContrato,
} from '../controllers/contrato.controller'

const router = Router()

// Público (auth opcional): devuelve T&C vigentes, comisión y hash. Si el usuario está
// logueado, resuelve la comisión de SU perfil; si no, muestra los valores por defecto.
router.get('/terminos-actuales', authOptional, getTerminosActuales)

// Requiere auth: el proveedor acepta el contrato
router.post('/aceptar', authRequired, aceptarContrato)

// Requiere auth: devuelve el contrato vigente del usuario logueado
router.get('/mi-contrato', authRequired, getMiContrato)

export default router
