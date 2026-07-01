import { RequestHandler } from 'express'
import { Op } from 'sequelize'
import AutorizacionExcepcional from '../models/autorizacionExcepcional'
import { logger } from '../libs/logger'

const MOTIVO_MAX_CHARS   = 1000
const COOLDOWN_RECHAZO_HS = 24

// ── POST /api/autorizaciones/solicitar ────────────────────────────────────────
// Cualquier usuario autenticado puede solicitar una autorización excepcional.
// La solicitud queda en estado 'solicitada' hasta que un admin la apruebe o rechace.
export const solicitarAutorizacion: RequestHandler = async (req: any, res, next) => {
    try {
        const persona_id = req.persona?.id_persona as number
        const { accion, recurso_tipo, recurso_id, motivo_solicitud } = req.body

        if (!accion || !recurso_tipo || !recurso_id || !motivo_solicitud) {
            res.status(400).json({
                message: 'Campos requeridos: accion, recurso_tipo, recurso_id, motivo_solicitud',
            })
            return
        }

        if (typeof recurso_id !== 'number' || !Number.isInteger(recurso_id) || recurso_id <= 0) {
            res.status(400).json({ message: 'recurso_id debe ser un entero positivo' })
            return
        }

        // Fix 6 — límite de longitud en campos de texto libre
        const motivoTrimmed = String(motivo_solicitud).trim()
        if (motivoTrimmed.length > MOTIVO_MAX_CHARS) {
            res.status(400).json({
                message: `motivo_solicitud no puede superar ${MOTIVO_MAX_CHARS} caracteres (recibido: ${motivoTrimmed.length})`,
            })
            return
        }
        if (String(accion).trim().length > 100 || String(recurso_tipo).trim().length > 50) {
            res.status(400).json({ message: 'accion (máx 100) o recurso_tipo (máx 50) exceden el largo permitido' })
            return
        }

        // Fix 4 — cooldown tras rechazo: evitar spam de re-solicitudes
        const hace24hs = new Date(Date.now() - COOLDOWN_RECHAZO_HS * 60 * 60 * 1000)
        const rechazadaReciente = await AutorizacionExcepcional.findOne({
            where: {
                persona_id,
                accion,
                recurso_id,
                estado: 'rechazada',
                fecha_aprobacion: { [Op.gte]: hace24hs },
            },
        })
        if (rechazadaReciente) {
            const reintento = new Date(rechazadaReciente.fecha_aprobacion!.getTime() + COOLDOWN_RECHAZO_HS * 60 * 60 * 1000)
            res.status(429).json({
                message: `Tu solicitud fue rechazada recientemente. Podés volver a intentarlo después de ${COOLDOWN_RECHAZO_HS} horas.`,
                reintento_disponible_en: reintento,
            })
            return
        }

        // Evitar solicitudes duplicadas pendientes para el mismo recurso+acción
        const existente = await AutorizacionExcepcional.findOne({
            where: { persona_id, accion, recurso_id, estado: 'solicitada' },
        })
        if (existente) {
            res.status(409).json({
                message: 'Ya tenés una solicitud pendiente para esta acción sobre este recurso',
                id_autorizacion: existente.id_autorizacion,
            })
            return
        }

        const autorizacion = await AutorizacionExcepcional.create({
            persona_id,
            accion:           String(accion).trim(),
            recurso_tipo:     String(recurso_tipo).trim(),
            recurso_id:       Number(recurso_id),
            motivo_solicitud: motivoTrimmed,
            estado:          'solicitada',
            solicitada_por:  persona_id,
            fecha_solicitud: new Date(),
        })

        logger.info('[Autorizacion] Solicitud creada', {
            id_autorizacion: autorizacion.id_autorizacion,
            persona_id,
            accion,
            recurso_tipo,
            recurso_id,
        })

        res.status(201).json({ ok: true, autorizacion: autorizacion.toJSON() })
    } catch (err) {
        next(err)
    }
}

// ── GET /api/admin/autorizaciones/pendientes ──────────────────────────────────
export const getPendientes: RequestHandler = async (_req, res, next) => {
    try {
        const pendientes = await AutorizacionExcepcional.findAll({
            where: { estado: 'solicitada' },
            order: [['fecha_solicitud', 'ASC']],
        })
        res.json({ autorizaciones: pendientes.map(a => a.toJSON()) })
    } catch (err) {
        next(err)
    }
}

// ── POST /api/admin/autorizaciones/:id/aprobar ────────────────────────────────
export const aprobarAutorizacion: RequestHandler = async (req: any, res, next) => {
    try {
        const { id } = req.params
        const admin_id = req.persona?.id_persona as number

        const autorizacion = await AutorizacionExcepcional.findByPk(id)
        if (!autorizacion) {
            res.status(404).json({ message: 'Autorización no encontrada' })
            return
        }
        if (autorizacion.estado !== 'solicitada') {
            res.status(409).json({
                message: `No se puede aprobar: estado actual es '${autorizacion.estado}'`,
            })
            return
        }

        // Fix 3 — un admin no puede aprobar su propia solicitud
        if (autorizacion.solicitada_por === admin_id) {
            res.status(403).json({ message: 'No podés aprobar una solicitud que vos mismo enviaste' })
            return
        }

        await autorizacion.update({
            estado:           'aprobada',
            aprobada_por:     admin_id,
            fecha_aprobacion: new Date(),
        })

        logger.info('[Autorizacion] Aprobada', {
            id_autorizacion: autorizacion.id_autorizacion,
            aprobada_por:    admin_id,
        })

        res.json({ ok: true, autorizacion: autorizacion.toJSON() })
    } catch (err) {
        next(err)
    }
}

// ── POST /api/admin/autorizaciones/:id/rechazar ───────────────────────────────
export const rechazarAutorizacion: RequestHandler = async (req: any, res, next) => {
    try {
        const { id } = req.params
        const admin_id = req.persona?.id_persona as number

        const autorizacion = await AutorizacionExcepcional.findByPk(id)
        if (!autorizacion) {
            res.status(404).json({ message: 'Autorización no encontrada' })
            return
        }
        if (autorizacion.estado !== 'solicitada') {
            res.status(409).json({
                message: `No se puede rechazar: estado actual es '${autorizacion.estado}'`,
            })
            return
        }

        await autorizacion.update({
            estado:           'rechazada',
            aprobada_por:     admin_id,
            fecha_aprobacion: new Date(),
        })

        logger.info('[Autorizacion] Rechazada', {
            id_autorizacion: autorizacion.id_autorizacion,
            rechazada_por:   admin_id,
        })

        res.json({ ok: true, autorizacion: autorizacion.toJSON() })
    } catch (err) {
        next(err)
    }
}
