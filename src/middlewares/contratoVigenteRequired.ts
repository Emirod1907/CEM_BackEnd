import { NextFunction, Request, Response } from 'express'
import Contrato from '../models/contrato'
import { VERSION_TERMINOS } from '../config/terminos'
import { isAdminUser } from '../services/authz.service'

// Bloquea rutas de publicación si el usuario no tiene un contrato vigente del ámbito
// requerido ('salon' o 'proveedor'). Debe ir DESPUÉS de authRequired.
const contratoVigenteRequired = (ambito: 'salon' | 'proveedor') =>
    async (req: Request, res: Response, next: NextFunction) => {
    try {
        const persona_id = req.persona?.id_persona
        if (!persona_id) {
            return res.status(401).json({ message: 'No autorizado.' })
        }

        if (await isAdminUser(persona_id)) {
            return next()
        }

        const contrato = await Contrato.findOne({
            where: { persona_id, estado: 'vigente', aceptado: true, ambito },
            attributes: ['id_contrato', 'version_terminos', 'fecha_aceptacion'],
        })

        if (!contrato) {
            return res.status(403).json({
                message: 'Debés aceptar los términos y condiciones antes de publicar servicios o salones.',
                requiere_contrato: true,
                ambito,
                version_requerida: VERSION_TERMINOS,
            })
        }

        // Aunque exista un contrato vigente, verificar que sea de la versión actual.
        // Si la versión cambió, el proveedor debe aceptar la nueva antes de continuar.
        if (contrato.version_terminos !== VERSION_TERMINOS) {
            return res.status(403).json({
                message: 'Los términos y condiciones fueron actualizados. Debés aceptar la nueva versión para continuar publicando.',
                requiere_contrato: true,
                version_requerida: VERSION_TERMINOS,
                version_aceptada: contrato.version_terminos,
            })
        }

        next()
    } catch (error) {
        return res.status(500).json({ message: 'Error interno del servidor.' })
    }
}

export default contratoVigenteRequired
