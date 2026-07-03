import { RequestHandler } from 'express'
import Contrato from '../models/contrato'
import { VERSION_TERMINOS, COMISION_DEFAULT, COMISION_PROVEEDOR_DEFAULT, TEXTO_TERMINOS, hashTerminos } from '../config/terminos'
import ConfiguracionComision, { TIPOS_PERFIL, TipoPerfil } from '../models/configuracionComision'
import Persona from '../models/persona'
import Rol from '../models/rol'
import { logger } from '../libs/logger'

// Mapea el rol/categoría de una persona al tipo_perfil de comisión correspondiente
async function resolverTipoPerfil(persona_id: number): Promise<TipoPerfil> {
    try {
        const persona = await Persona.findByPk(persona_id, {
            include: [{ model: Rol, as: 'Rol', attributes: ['nombre'] }],
        })
        const rol: string = (persona as any)?.Rol?.nombre ?? ''
        if (rol === 'dueno_salon') return 'salon'

        // Para proveedores, usar la categoría de servicio registrada en su perfil
        const cat: string = (persona as any)?.categoria_servicio ?? ''
        if ((TIPOS_PERFIL as readonly string[]).includes(cat)) return cat as TipoPerfil

        return 'otro'
    } catch {
        return 'otro'
    }
}

// GET /api/contratos/terminos-actuales
// Público — devuelve la versión vigente de T&C, comisión y hash para que el cliente
// pueda mostrarlos antes de pedir aceptación.
export const getTerminosActuales: RequestHandler = async (req, res) => {
    const _req = req
    try {
        // Resolver comisiones vigentes del perfil del usuario (si está autenticado)
        // o devolver defaults para usuarios no autenticados que solo quieren ver T&C
        const persona_id = ((_req as any).persona?.id_persona) as number | undefined
        let comisionClientePct   = COMISION_DEFAULT
        let comisionProveedorPct = COMISION_PROVEEDOR_DEFAULT
        if (persona_id) {
            try {
                const tipoPerfil = await resolverTipoPerfil(persona_id)
                const cfg = await ConfiguracionComision.findOne({
                    where: { tipo_perfil: tipoPerfil, activo: true },
                })
                if (cfg) {
                    comisionClientePct   = Number(cfg.comision_cliente_porcentaje)
                    comisionProveedorPct = Number(cfg.comision_proveedor_porcentaje)
                }
            } catch { /* fallback a defaults */ }
        }

        const hash = hashTerminos()
        return res.json({
            version: VERSION_TERMINOS,
            comision_cliente_porcentaje:   comisionClientePct,
            comision_proveedor_porcentaje: comisionProveedorPct,
            texto_terminos: TEXTO_TERMINOS,
            hash_terminos: hash,
        })
    } catch (error) {
        logger.error('[Contratos] Error al obtener términos actuales', { error })
        return res.status(500).json({ message: 'Error interno del servidor.' })
    }
}

// POST /api/contratos/aceptar
// Requiere authRequired. El proveedor acepta los T&C vigentes.
// Guarda snapshot inmutable: comisión, texto, hash, IP, user-agent, timestamp.
export const aceptarContrato: RequestHandler = async (req, res) => {
    const persona_id = req.persona?.id_persona
    const { acepto, ambito } = req.body
    // Un contrato por ámbito: 'salon' (dueño de salón) o 'proveedor' (servicios/productos)
    const ambitoContrato: 'salon' | 'proveedor' = ambito === 'proveedor' ? 'proveedor' : 'salon'

    if (!acepto || acepto !== true) {
        return res.status(400).json({
            message: 'Debés aceptar los términos explícitamente enviando { "acepto": true }.',
        })
    }

    try {
        // Si ya existe un contrato vigente de este ámbito para esta versión, no duplicar
        const contratoExistente = await Contrato.findOne({
            where: { persona_id, estado: 'vigente', version_terminos: VERSION_TERMINOS, ambito: ambitoContrato },
        })
        if (contratoExistente) {
            return res.status(409).json({
                message: 'Ya tenés un contrato vigente para esta versión de los términos.',
                contrato: contratoExistente,
            })
        }

        // Marcar contratos vigentes anteriores del MISMO ámbito como 'reemplazado'
        const reemplazados = await Contrato.update(
            { estado: 'reemplazado' },
            { where: { persona_id, estado: 'vigente', ambito: ambitoContrato } }
        )
        if (reemplazados[0] > 0) {
            logger.info('[Contratos] Contratos previos marcados como reemplazados', {
                persona_id,
                cantidad: reemplazados[0],
            })
        }

        // Capturar IP (soporta proxy / ngrok con x-forwarded-for)
        const forwarded = req.headers['x-forwarded-for']
        const ip_aceptacion = (typeof forwarded === 'string'
            ? forwarded.split(',')[0].trim()
            : Array.isArray(forwarded)
                ? forwarded[0]
                : null
        ) ?? req.ip ?? 'desconocida'

        const user_agent = (req.headers['user-agent'] as string) ?? 'desconocido'

        // Resolver ambas comisiones vigentes para el perfil de este proveedor/dueño
        const tipoPerfil = await resolverTipoPerfil(persona_id!)
        const configComision = await ConfiguracionComision.findOne({
            where: { tipo_perfil: tipoPerfil, activo: true },
        })
        // Snapshot inmutable de AMBOS porcentajes al momento de aceptación
        const comisionClienteSnapshot   = configComision
            ? Number(configComision.comision_cliente_porcentaje)
            : COMISION_DEFAULT
        const comisionProveedorSnapshot = configComision
            ? Number(configComision.comision_proveedor_porcentaje)
            : COMISION_PROVEEDOR_DEFAULT

        const hash = hashTerminos()
        const contrato = await Contrato.create({
            persona_id: persona_id!,
            ambito: ambitoContrato,
            version_terminos: VERSION_TERMINOS,
            comision_cliente_porcentaje:   comisionClienteSnapshot,
            comision_proveedor_porcentaje: comisionProveedorSnapshot,
            texto_terminos: TEXTO_TERMINOS,
            hash_terminos: hash,
            aceptado: true,
            fecha_aceptacion: new Date(),
            ip_aceptacion,
            user_agent,
            estado: 'vigente',
        })

        logger.info('[Contratos] Contrato aceptado', {
            id_contrato: contrato.id_contrato,
            persona_id,
            version: VERSION_TERMINOS,
            ip: ip_aceptacion,
        })

        return res.status(201).json({
            message: 'Contrato aceptado exitosamente.',
            contrato,
        })
    } catch (error) {
        logger.error('[Contratos] Error al aceptar contrato', { error, persona_id })
        return res.status(500).json({ message: 'Error interno al registrar el contrato.' })
    }
}

// GET /api/contratos/mi-contrato
// Requiere authRequired. Devuelve el contrato vigente del usuario logueado.
export const getMiContrato: RequestHandler = async (req, res) => {
    const persona_id = req.persona?.id_persona
    // Consultar el contrato de un ámbito puntual (?ambito=salon|proveedor)
    const ambitoQ = req.query.ambito
    const ambito = ambitoQ === 'proveedor' ? 'proveedor' : ambitoQ === 'salon' ? 'salon' : null
    try {
        const contrato = await Contrato.findOne({
            where: { persona_id, estado: 'vigente', ...(ambito ? { ambito } : {}) },
            order: [['fecha_aceptacion', 'DESC']],
        })

        // Indicar si la versión del contrato vigente coincide con la versión actual
        const estaActualizado = contrato
            ? contrato.version_terminos === VERSION_TERMINOS
            : false

        return res.json({
            contrato: contrato ?? null,
            version_actual: VERSION_TERMINOS,
            esta_actualizado: estaActualizado,
            requiere_nueva_aceptacion: !contrato || !estaActualizado,
        })
    } catch (error) {
        logger.error('[Contratos] Error al obtener contrato', { error, persona_id })
        return res.status(500).json({ message: 'Error interno del servidor.' })
    }
}
