import { Request, RequestHandler, Response } from 'express'
import ConfiguracionComision, { TIPOS_PERFIL, TipoPerfil } from '../models/configuracionComision'
import HistorialComisiones from '../models/historialComisiones'
import Contrato from '../models/contrato'
import Persona from '../models/persona'
import { sendComisionActualizadaEmail } from '../services/email.service'
import { logger } from '../libs/logger'

const LABEL_PERFIL: Record<string, string> = {
    salon: 'Salones', catering: 'Catering', decoracion: 'Decoración', audio_video: 'Audio y Video',
    seguridad: 'Seguridad', mobiliario: 'Mobiliario', entretenimiento: 'Entretenimiento', otro: 'Otros',
}

// Notifica (best-effort) a los usuarios con contrato vigente del ámbito afectado por el cambio.
// tipo_perfil 'salon' → dueños de salón (ámbito 'salon'); el resto → proveedores (ámbito 'proveedor').
async function notificarCambioComision(
    tipo_perfil: string,
    cambios: { clienteAnt: number; clienteNue: number; provAnt: number; provNue: number },
): Promise<number> {
    const ambito = tipo_perfil === 'salon' ? 'salon' : 'proveedor'
    const contratos = await Contrato.findAll({
        where: { ambito, estado: 'vigente' },
        include: [{ model: Persona, as: 'Persona', attributes: ['nombre', 'email'], required: true }],
    })
    // Evitar mails duplicados si un usuario tuviera más de un contrato
    const vistos = new Set<string>()
    let notificados = 0
    for (const c of contratos) {
        const p: any = (c as any).Persona
        if (!p?.email || vistos.has(p.email)) continue
        vistos.add(p.email)
        sendComisionActualizadaEmail(p.email, p.nombre || 'Usuario', LABEL_PERFIL[tipo_perfil] || tipo_perfil, cambios)
            .catch(err => logger.warn('[Comision] Email de notificación falló', { email: p.email, error: err?.message }))
        notificados++
    }
    return notificados
}

const PORCENTAJE_MIN = 0
const PORCENTAJE_MAX = 50

// GET /api/admin/comisiones
export const getComisiones: RequestHandler = async (_req: Request, res: Response) => {
    try {
        const configs = await ConfiguracionComision.findAll({
            include: [{
                model: Persona,
                as: 'AdminActualizador',
                attributes: ['id_persona', 'nombre', 'apellido', 'email'],
                required: false,
            }],
            order: [['tipo_perfil', 'ASC']],
        })
        return res.json({ comisiones: configs })
    } catch (error: any) {
        return res.status(500).json({ message: 'Error al obtener configuraciones de comisiones.', error: error.message })
    }
}

// PUT /api/admin/comisiones/:tipo_perfil
export const updateComision: RequestHandler = async (req: Request, res: Response) => {
    const { tipo_perfil } = req.params
    const { comision_cliente_porcentaje, comision_proveedor_porcentaje, activo } = req.body

    if (!(TIPOS_PERFIL as readonly string[]).includes(tipo_perfil)) {
        return res.status(400).json({
            message: `tipo_perfil inválido. Valores permitidos: ${TIPOS_PERFIL.join(', ')}.`,
        })
    }

    if (comision_cliente_porcentaje !== undefined) {
        const v = Number(comision_cliente_porcentaje)
        if (isNaN(v) || v < PORCENTAJE_MIN || v > PORCENTAJE_MAX) {
            return res.status(422).json({ message: `comision_cliente_porcentaje debe estar entre ${PORCENTAJE_MIN} y ${PORCENTAJE_MAX}.` })
        }
    }
    if (comision_proveedor_porcentaje !== undefined) {
        const v = Number(comision_proveedor_porcentaje)
        if (isNaN(v) || v < PORCENTAJE_MIN || v > PORCENTAJE_MAX) {
            return res.status(422).json({ message: `comision_proveedor_porcentaje debe estar entre ${PORCENTAJE_MIN} y ${PORCENTAJE_MAX}.` })
        }
    }

    try {
        const config = await ConfiguracionComision.findOne({ where: { tipo_perfil } })
        if (!config) {
            return res.status(404).json({ message: `No existe configuración para tipo_perfil '${tipo_perfil}'.` })
        }

        const cliente_anterior  = Number(config.comision_cliente_porcentaje)
        const proveedor_anterior = Number(config.comision_proveedor_porcentaje)

        const cliente_nuevo  = comision_cliente_porcentaje  !== undefined ? Number(comision_cliente_porcentaje)  : cliente_anterior
        const proveedor_nuevo = comision_proveedor_porcentaje !== undefined ? Number(comision_proveedor_porcentaje) : proveedor_anterior

        const admin_id = req.persona!.id_persona

        await config.update({
            comision_cliente_porcentaje:  cliente_nuevo,
            comision_proveedor_porcentaje: proveedor_nuevo,
            ...(activo !== undefined ? { activo } : {}),
            actualizado_por: admin_id,
            fecha_actualizacion: new Date(),
        })

        // Registrar historial + notificar a los usuarios solo si algún porcentaje cambió
        let notificados = 0
        if (cliente_nuevo !== cliente_anterior || proveedor_nuevo !== proveedor_anterior) {
            await HistorialComisiones.create({
                config_id: config.id_config,
                tipo_perfil: config.tipo_perfil,
                cliente_anterior,
                cliente_nuevo,
                proveedor_anterior,
                proveedor_nuevo,
                admin_id,
                fecha: new Date(),
            })

            try {
                notificados = await notificarCambioComision(tipo_perfil, {
                    clienteAnt: cliente_anterior, clienteNue: cliente_nuevo,
                    provAnt: proveedor_anterior, provNue: proveedor_nuevo,
                })
            } catch (e: any) {
                logger.warn('[Comision] No se pudo notificar el cambio', { error: e.message })
            }
        }

        return res.json({
            message: 'Comisión actualizada correctamente.',
            comision: config,
            notificados,
        })
    } catch (error: any) {
        return res.status(500).json({ message: 'Error al actualizar comisión.', error: error.message })
    }
}

// GET /api/admin/comisiones/:tipo_perfil/historial
export const getHistorialComision: RequestHandler = async (req: Request, res: Response) => {
    const { tipo_perfil } = req.params

    if (!(TIPOS_PERFIL as readonly string[]).includes(tipo_perfil)) {
        return res.status(400).json({
            message: `tipo_perfil inválido. Valores permitidos: ${TIPOS_PERFIL.join(', ')}.`,
        })
    }

    try {
        const historial = await HistorialComisiones.findAll({
            where: { tipo_perfil },
            include: [{
                model: Persona,
                as: 'Admin',
                attributes: ['id_persona', 'nombre', 'apellido', 'email'],
                required: false,
            }],
            order: [['fecha', 'DESC']],
        })
        return res.json({ historial })
    } catch (error: any) {
        return res.status(500).json({ message: 'Error al obtener historial.', error: error.message })
    }
}

// GET /api/comisiones/vigente/:tipo_perfil  — uso interno (Feature 1 / contratos)
export const getComisionVigente: RequestHandler = async (req: Request, res: Response) => {
    const { tipo_perfil } = req.params

    try {
        const config = await ConfiguracionComision.findOne({
            where: { tipo_perfil, activo: true },
            attributes: ['tipo_perfil', 'comision_cliente_porcentaje', 'comision_proveedor_porcentaje'],
        })
        if (!config) {
            return res.status(404).json({ message: `No hay comisión activa para tipo_perfil '${tipo_perfil}'.` })
        }
        return res.json({ comision: config })
    } catch (error: any) {
        return res.status(500).json({ message: 'Error al obtener comisión vigente.', error: error.message })
    }
}
