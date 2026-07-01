import { NextFunction, Request, Response } from 'express'
import Contrato from '../models/contrato'
import { VERSION_TERMINOS } from '../config/terminos'

// Bloquea rutas de publicación si el usuario no tiene un contrato vigente y actualizado.
// Debe ir DESPUÉS de authRequired en la cadena de middlewares.
const contratoVigenteRequired = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const persona_id = req.persona?.id_persona
        if (!persona_id) {
            return res.status(401).json({ message: 'No autorizado.' })
        }

        const contrato = await Contrato.findOne({
            where: { persona_id, estado: 'vigente', aceptado: true },
            attributes: ['id_contrato', 'version_terminos', 'fecha_aceptacion'],
        })

        if (!contrato) {
            return res.status(403).json({
                message: 'Debés aceptar los términos y condiciones antes de publicar servicios o salones.',
                requiere_contrato: true,
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
