import { Request, Response, NextFunction } from 'express'
import { Transaction, QueryTypes } from 'sequelize'
import db from '../db/connection'
import AutorizacionExcepcional from '../models/autorizacionExcepcional'

// Extiende la request para que los handlers downstream puedan consumir la autorización
declare global {
    namespace Express {
        interface Request {
            autorizacion?: AutorizacionExcepcional
            // Llamar dentro de la transacción del handler para consumo atómico.
            // Si la autorización ya fue consumida por una request paralela (0 rows afectados),
            // lanza un error → el caller debe hacer rollback.
            consumirAutorizacion?: (transaction: Transaction) => Promise<void>
        }
    }
}

/**
 * Middleware factory para acciones excepcionales de un solo uso.
 *
 * @param accion       Identificador de la acción (ej: 'editar_evento_cerrado')
 * @param getRecursoId Extrae el recurso_id de la request. Por defecto usa req.params.id
 *
 * Uso:
 *   router.put('/:id', authRequired, autorizacionExcepcionalRequired('editar_evento_cerrado'), handler)
 *
 * En el handler:
 *   await db.transaction(async t => {
 *       await req.consumirAutorizacion!(t)   // consume atómicamente — lanza si ya fue usada
 *       // ... realizar la acción ...
 *   })
 */
const autorizacionExcepcionalRequired = (
    accion: string,
    getRecursoId: (req: Request) => number = (req) => Number((req.params as any).id)
) => {
    return async (req: Request, res: Response, next: NextFunction) => {
        try {
            const persona_id = (req as any).persona?.id_persona as number | undefined
            if (!persona_id) {
                res.status(401).json({ message: 'No autorizado' })
                return
            }

            const recurso_id = getRecursoId(req)
            if (!recurso_id || isNaN(recurso_id)) {
                res.status(400).json({ message: 'recurso_id inválido' })
                return
            }

            // Pre-check rápido (sin lock) — fail fast con 403 si no hay autorización aprobada
            const autorizacion = await AutorizacionExcepcional.findOne({
                where: { persona_id, accion, recurso_id, estado: 'aprobada' },
            })

            if (!autorizacion) {
                res.status(403).json({
                    message: `Acción '${accion}' requiere una autorización excepcional aprobada para este recurso`,
                    codigo: 'AUTORIZACION_REQUERIDA',
                })
                return
            }

            // Adjuntar la autorización y la función de consumo atómico al handler
            req.autorizacion = autorizacion

            req.consumirAutorizacion = async (transaction: Transaction) => {
                // UPDATE condicional: solo actualiza si el estado sigue siendo 'aprobada'.
                // Si otra request paralela ya la consumió, affectedRows será 0 → lanzar error
                // para que la transacción del handler haga rollback.
                // Con QueryTypes.UPDATE, Sequelize (MySQL) retorna [undefined, affectedRows: number]
                const [, affectedRows] = await db.query(
                    `UPDATE AutorizacionesExcepcionales
                     SET estado = 'consumida', fecha_consumo = NOW()
                     WHERE id_autorizacion = :id AND estado = 'aprobada'`,
                    {
                        replacements: { id: autorizacion.id_autorizacion },
                        transaction,
                        type: QueryTypes.UPDATE,
                    }
                )

                if ((affectedRows as number) === 0) {
                    throw new Error(
                        `La autorización #${autorizacion.id_autorizacion} ya fue consumida o expiró`
                    )
                }
            }

            next()
        } catch (err) {
            next(err)
        }
    }
}

export default autorizacionExcepcionalRequired
