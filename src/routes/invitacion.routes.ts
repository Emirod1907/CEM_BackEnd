import { Router } from 'express'
import authRequired from '../middlewares/validateToken'
import {
    crearInvitacion,
    generarLinkPorReserva,
    generarNuevaInvitacion,
    getInvitacionPublica,
    getInvitacionPorToken,
    getOgPreview,
    confirmarInvitados,
    confirmarAsistencia,
    pagarInvitacion,
    validarQR,
    getMisInvitaciones,
    editarInvitacion,
    eliminarInvitacion
} from '../controllers/invitacion.controller'

const router = Router()

// ── Públicas ──────────────────────────────────────────────────────────────────
// OG preview para WhatsApp (redirige al frontend con meta tags)
router.get('/og/:token', getOgPreview)

// Nueva pantalla RSVP con WhatsApp (single-use, marca accedida_en)
router.get('/publica/:token', getInvitacionPublica)

// Legacy: usado por validar-entrada (QR scan)
router.get('/:token', getInvitacionPorToken)

// Legacy: confirmación simple con nombre+email
router.post('/:token/confirmar', confirmarAsistencia)

// ── Requieren auth (entusiasta que recibió la invitación) ─────────────────────
router.post('/publica/:token/confirmar', authRequired, confirmarInvitados)
router.post('/publica/:token/pagar',    authRequired, pagarInvitacion)

// ── Requieren auth (organizador) ──────────────────────────────────────────────
router.post('/crear',              authRequired, crearInvitacion)
router.post('/generar-por-reserva', authRequired, generarLinkPorReserva)
router.post('/generar-por-evento',  authRequired, generarNuevaInvitacion)
router.post('/validar',            authRequired, validarQR)
router.get('/mis-invitaciones/:evento_id', authRequired, getMisInvitaciones)
// Editar / eliminar una invitación (métodos propios, no colisionan con GET/POST /:token)
router.patch('/:id',  authRequired, editarInvitacion)
router.delete('/:id', authRequired, eliminarInvitacion)

export default router
