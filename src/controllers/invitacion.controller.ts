import { Request, Response, RequestHandler } from 'express'
import crypto from 'crypto'
import QRCode from 'qrcode'
import { MercadoPagoConfig, Preference } from 'mercadopago'
import Invitacion from '../models/invitacion'
import InvitadoConfirmado from '../models/invitadoConfirmado'
import Evento from '../models/evento'
import Reserva from '../models/reserva'
import Orden from '../models/orden'
import Persona from '../models/persona'
import { sendEntradaEmail } from '../services/email.service'
import { logger } from '../libs/logger'
import { getMpCredentials, getMpNotificationUrl, getMpBackUrls } from '../config/mercadopago'
import { canManageOwnedResource } from '../services/authz.service'

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173'

const getMpClient = () => {
    const { accessToken } = getMpCredentials()
    return new MercadoPagoConfig({ accessToken })
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const toInvitacionPublica = (inv: Invitacion, evento: any) => ({
    token: inv.token,
    num_invitados: inv.num_invitados,
    nombre_invitado: inv.nombre_invitado,
    estado: inv.estado,
    ya_confirmada: inv.estado === 'confirmada',
    evento: evento ? {
        id_evento: evento.id_evento,
        nombre: evento.nombre,
        descripcion: evento.descripcion,
        fecha: evento.fecha,
        imagen: evento.imagen,
        precio: evento.precio,
        datos_evento: evento.datos_evento
    } : null
})

// ─── Organizador: crear invitación con teléfono y cupo ───────────────────────

// POST /api/invitaciones/crear
export const crearInvitacion: RequestHandler = async (req: Request, res: Response) => {
    const { evento_id, telefono, num_invitados, nombre_invitado } = req.body
    const persona = (req as any).persona

    if (!evento_id || !telefono || !num_invitados) {
        return res.status(400).json({ message: 'evento_id, telefono y num_invitados son requeridos' })
    }

    if (Number(num_invitados) < 1 || Number(num_invitados) > 20) {
        return res.status(400).json({ message: 'num_invitados debe estar entre 1 y 20' })
    }

    try {
        const evento = await Evento.findOne({
            where: { id_evento: evento_id, creado_por: persona.id_persona }
        })

        if (!evento) {
            return res.status(404).json({ message: 'Evento no encontrado o no sos el organizador' })
        }

        const token = crypto.randomUUID().replace(/-/g, '')
        const invitacion = await Invitacion.create({
            token,
            evento_id: Number(evento_id),
            telefono: String(telefono),
            num_invitados: Number(num_invitados),
            nombre_invitado: nombre_invitado || null,
            estado: 'pendiente'
        })

        const link = `${FRONTEND_URL}/invitacion/${token}`

        return res.status(201).json({ token, link, id_invitacion: invitacion.id_invitacion })
    } catch (error: any) {
        logger.error('[Invitacion] Error creando invitación', { error: error.message })
        return res.status(500).json({ message: 'Error al crear la invitación', error: error.message })
    }
}

// ─── Legacy: generar por reserva ─────────────────────────────────────────────

// POST /api/invitaciones/generar-por-reserva
export const generarLinkPorReserva: RequestHandler = async (req: Request, res: Response) => {
    const { reserva_id } = req.body
    const persona = (req as any).persona

    if (!reserva_id) {
        return res.status(400).json({ message: 'reserva_id requerido' })
    }

    try {
        const reserva = await Reserva.findOne({
            where: { id_reserva: reserva_id, persona_id: persona.id_persona }
        })

        if (!reserva) {
            return res.status(404).json({ message: 'Reserva no encontrada' })
        }

        if (!reserva.evento_id) {
            return res.status(202).json({
                message: 'El evento aún está siendo procesado. Intentá en unos segundos.',
                procesando: true
            })
        }

        let datosEvento: any = {}
        try { datosEvento = reserva.datos_evento ? JSON.parse(reserva.datos_evento) : {} } catch { }

        if (datosEvento.es_publico !== false) {
            return res.status(400).json({ message: 'Este evento es público. Los links de invitación son para eventos privados.' })
        }

        const token = crypto.randomUUID().replace(/-/g, '')
        await Invitacion.create({
            token,
            evento_id: reserva.evento_id,
            num_invitados: 1,
            estado: 'pendiente'
        })

        const link = `${FRONTEND_URL}/invitacion/${token}`
        return res.status(201).json({ token, link })
    } catch (error: any) {
        logger.error('[Invitacion] Error generando link', { error: error.message })
        return res.status(500).json({ message: 'Error al generar el link', error: error.message })
    }
}

// POST /api/invitaciones/generar-por-evento
export const generarNuevaInvitacion: RequestHandler = async (req: Request, res: Response) => {
    const { evento_id } = req.body
    const persona = (req as any).persona

    if (!evento_id) {
        return res.status(400).json({ message: 'evento_id requerido' })
    }

    try {
        const evento = await Evento.findOne({
            where: { id_evento: evento_id, creado_por: persona.id_persona }
        })

        if (!evento) {
            return res.status(404).json({ message: 'Evento no encontrado o no sos el organizador' })
        }

        const token = crypto.randomUUID().replace(/-/g, '')
        await Invitacion.create({
            token,
            evento_id: Number(evento_id),
            num_invitados: 1,
            estado: 'pendiente'
        })

        const link = `${FRONTEND_URL}/invitacion/${token}`
        return res.status(201).json({ token, link })
    } catch (error: any) {
        logger.error('[Invitacion] Error generando invitación', { error: error.message })
        return res.status(500).json({ message: 'Error al generar invitación', error: error.message })
    }
}

// ─── Público: ver invitación (marca accedida, single-use) ────────────────────

// GET /api/invitaciones/publica/:token
export const getInvitacionPublica: RequestHandler = async (req: Request, res: Response) => {
    const { token } = req.params

    try {
        const invitacion = await Invitacion.findOne({
            where: { token },
            include: [{ model: Evento, as: 'Evento' }]
        })

        if (!invitacion) {
            return res.status(404).json({ message: 'Invitación no encontrada o inválida' })
        }

        // Single-use: if link was already accessed by someone else (different session), invalidate
        if (invitacion.accedida_en && invitacion.estado === 'pendiente') {
            // Allow re-access within 30 minutes to handle page refreshes
            const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000)
            if (invitacion.accedida_en < thirtyMinAgo) {
                await invitacion.update({ estado: 'usada' })
                return res.status(410).json({ message: 'Este link ya fue utilizado. Por seguridad, cada link es de uso único.' })
            }
        }

        if (invitacion.estado === 'usada') {
            return res.status(410).json({ message: 'Este link ya fue utilizado. Por seguridad, cada link es de uso único.' })
        }

        // Mark first access timestamp
        if (!invitacion.accedida_en) {
            await invitacion.update({ accedida_en: new Date() })
        }

        const evento = (invitacion as any).Evento
        return res.json(toInvitacionPublica(invitacion, evento))
    } catch (error: any) {
        logger.error('[Invitacion] Error obteniendo invitación pública', { error: error.message })
        return res.status(500).json({ message: 'Error del servidor', error: error.message })
    }
}

// ─── Legacy: GET /:token (para compatibilidad con validar-entrada) ───────────

// GET /api/invitaciones/:token
export const getInvitacionPorToken: RequestHandler = async (req: Request, res: Response) => {
    const { token } = req.params

    try {
        const invitacion = await Invitacion.findOne({
            where: { token },
            include: [{ model: Evento, as: 'Evento' }]
        })

        if (!invitacion) {
            return res.status(404).json({ message: 'Invitación no encontrada o inválida' })
        }

        if (invitacion.estado === 'usada') {
            return res.status(410).json({ message: 'Esta invitación ya fue utilizada en el evento.' })
        }

        const evento = (invitacion as any).Evento
        return res.json({
            estado: invitacion.estado,
            ya_confirmada: invitacion.estado === 'confirmada',
            nombre_invitado: invitacion.nombre_invitado,
            num_invitados: invitacion.num_invitados,
            evento: evento ? {
                id_evento: evento.id_evento,
                nombre: evento.nombre,
                descripcion: evento.descripcion,
                fecha: evento.fecha,
                imagen: evento.imagen,
                precio: evento.precio,
            } : null
        })
    } catch (error: any) {
        logger.error('[Invitacion] Error obteniendo invitación', { error: error.message })
        return res.status(500).json({ message: 'Error del servidor', error: error.message })
    }
}

// ─── Autenticado: confirmar asistencia con DNIs ───────────────────────────────

// POST /api/invitaciones/publica/:token/confirmar
export const confirmarInvitados: RequestHandler = async (req: Request, res: Response) => {
    const { token } = req.params
    // invitados: [{ dni, nombre, es_extra? }]
    const { invitados } = req.body
    const persona = (req as any).persona

    if (!invitados || !Array.isArray(invitados) || invitados.length === 0) {
        return res.status(400).json({ message: 'Se requiere al menos un invitado con DNI y nombre' })
    }

    for (const inv of invitados) {
        if (!inv.dni || !inv.nombre) {
            return res.status(400).json({ message: 'Cada invitado debe tener dni y nombre' })
        }
    }

    try {
        const invitacion = await Invitacion.findOne({
            where: { token },
            include: [{ model: Evento, as: 'Evento' }]
        })

        if (!invitacion) {
            return res.status(404).json({ message: 'Invitación no encontrada o inválida' })
        }

        if (invitacion.estado === 'usada') {
            return res.status(410).json({ message: 'Este link ya fue utilizado.' })
        }

        if (invitacion.estado === 'confirmada') {
            return res.status(409).json({ message: 'Ya confirmaste tu asistencia. Procedé al pago.' })
        }

        const asignados = invitados.filter((i: any) => !i.es_extra)
        const extras = invitados.filter((i: any) => i.es_extra)

        if (asignados.length > invitacion.num_invitados) {
            return res.status(400).json({
                message: `Solo podés registrar hasta ${invitacion.num_invitados} invitado(s) asignado(s)`
            })
        }

        // Persist each guest
        const registros = invitados.map((inv: any, idx: number) => ({
            invitacion_id: invitacion.id_invitacion,
            orden: inv.es_extra ? 0 : idx + 1,
            dni: String(inv.dni).trim(),
            nombre: String(inv.nombre).trim(),
            es_extra: Boolean(inv.es_extra)
        }))

        await InvitadoConfirmado.bulkCreate(registros)

        await invitacion.update({
            nombre_invitado: invitados[0]?.nombre || null,
            persona_id: persona.id_persona,
            estado: 'confirmada',
            fecha_confirmacion: new Date()
        })

        return res.json({
            message: 'Invitados registrados. Procedé al pago para confirmar.',
            total_invitados: invitados.length,
            extras: extras.length
        })
    } catch (error: any) {
        logger.error('[Invitacion] Error confirmando invitados', { error: error.message })
        return res.status(500).json({ message: 'Error al confirmar invitados', error: error.message })
    }
}

// ─── Autenticado: crear preferencia MercadoPago para todos los invitados ──────

// POST /api/invitaciones/publica/:token/pagar
export const pagarInvitacion: RequestHandler = async (req: Request, res: Response) => {
    const { token } = req.params
    // El invitado SIEMPRE paga la entrada completa (no se permite seña).
    const tipo_pago = 'total'
    const persona = (req as any).persona

    try {
        const invitacion = await Invitacion.findOne({
            where: { token },
            include: [
                { model: Evento, as: 'Evento' },
                { model: InvitadoConfirmado, as: 'InvitadosConfirmados' }
            ]
        })

        if (!invitacion) {
            return res.status(404).json({ message: 'Invitación no encontrada' })
        }

        if (invitacion.estado === 'usada') {
            return res.status(410).json({ message: 'Este link ya fue utilizado.' })
        }

        if (invitacion.estado === 'pendiente') {
            return res.status(400).json({ message: 'Primero confirmá los invitados antes de pagar.' })
        }

        const evento = (invitacion as any).Evento
        if (!evento || !evento.precio) {
            return res.status(400).json({ message: 'El evento no tiene precio configurado.' })
        }

        const invitados: InvitadoConfirmado[] = (invitacion as any).InvitadosConfirmados || []
        const cantidad = invitados.length || invitacion.num_invitados
        const precioUnitario = Number(evento.precio)
        const montoTotalCompleto = precioUnitario * cantidad
        // El invitado siempre paga la entrada completa (sin opción de seña).
        const esSeña = false
        const montoACobrar = montoTotalCompleto

        const tituloItem = `Entrada — ${evento.nombre}`
        const descripcionItem = `${cantidad} invitado(s)${esSeña ? ' · Seña del 30%' : ''}`

        const client = getMpClient()
        const preference = new Preference(client)

        // Crear la orden primero para usar id_orden como external_reference
        // (permite al webhook/confirmación encontrarla aunque MP no devuelva preference_id)
        const orden = await Orden.create({
            persona_id: persona.id_persona,
            items: JSON.stringify([{
                id_evento: evento.id_evento,
                nombre: tituloItem,
                precio: montoACobrar,
                cantidad: 1,
                subtotal: montoACobrar,
                tipo_pago
            }]),
            monto_total: montoACobrar,
            estado: 'pendiente',
            tipo: 'cliente'
        })

        let result: any
        try {
            result = await preference.create({
                body: {
                    items: [{
                        id: String(evento.id_evento),
                        title: tituloItem,
                        description: descripcionItem,
                        quantity: 1,
                        unit_price: montoACobrar,
                        currency_id: 'ARS'
                    }],
                    payer: {
                        email: persona.email,
                        name: persona.nombre,
                        surname: persona.apellido
                    },
                    back_urls: getMpBackUrls(),
                    auto_return: 'approved' as const,
                    external_reference: String(orden.id_orden),
                    ...(getMpNotificationUrl() ? { notification_url: getMpNotificationUrl() } : {}),
                    metadata: {
                        tipo: 'invitacion',
                        tipo_pago,
                        invitacion_token: token,
                        persona_id: persona.id_persona
                    }
                }
            })
        } catch (mpError: any) {
            // MP falló — eliminar la orden huérfana para no dejar basura en la DB
            await orden.destroy()
            throw mpError
        }

        await orden.update({ mp_preference_id: result.id })

        if (invitados.length > 0) {
            await InvitadoConfirmado.update(
                { orden_mp_id: orden.id_orden },
                { where: { invitacion_id: invitacion.id_invitacion } }
            )
        }

        return res.json({
            preference_id: result.id,
            init_point: result.init_point,
            sandbox_init_point: result.sandbox_init_point,
            orden_id: orden.id_orden,
            monto_total: montoACobrar,
            monto_total_completo: montoTotalCompleto,
            tipo_pago,
            saldo_pendiente: esSeña ? Math.round(montoTotalCompleto * 0.70 * 100) / 100 : 0,
            cantidad_invitados: cantidad
        })
    } catch (error: any) {
        logger.error('[Invitacion] Error creando preferencia de pago', { error: error.message })
        return res.status(500).json({ message: 'Error al crear el pago', error: error.message })
    }
}

// ─── Emitir entrada tras pago aprobado ────────────────────────────────────────
// Llamada desde el procesamiento de pagos (webhook / confirmación al volver del
// checkout) cuando se aprueba una orden de invitación. Genera el QR, lo persiste
// y envía la entrada por email al pagador. Idempotente: si el QR ya fue emitido
// no hace nada.
export async function emitirEntradaPagada(invitacionToken: string): Promise<void> {
    const invitacion = await Invitacion.findOne({
        where: { token: invitacionToken },
        include: [{ model: Evento, as: 'Evento' }]
    })
    if (!invitacion) {
        logger.error('[Invitacion] No se encontró invitación para emitir entrada', { token: invitacionToken })
        return
    }
    if (invitacion.qr_data) return // ya emitida

    const qrPayload = `${FRONTEND_URL}/validar-entrada?token=${invitacionToken}`
    const qrDataUrl = await QRCode.toDataURL(qrPayload, {
        width: 280,
        margin: 2,
        color: { dark: '#1a1a2e', light: '#ffffff' }
    })

    // Email del pagador: el registrado en la invitación o el de la persona que confirmó
    let email = invitacion.email_invitado
    let nombre = invitacion.nombre_invitado || 'Invitado'
    if (!email && invitacion.persona_id) {
        const persona = await Persona.findByPk(invitacion.persona_id, { attributes: ['email', 'nombre'] })
        if (persona) {
            email = (persona as any).email
            nombre = invitacion.nombre_invitado || (persona as any).nombre || nombre
        }
    }

    await invitacion.update({ qr_data: qrDataUrl, ...(email ? { email_invitado: email } : {}) })

    if (!email) {
        logger.warn('[Invitacion] Entrada emitida pero sin email para enviarla', { token: invitacionToken })
        return
    }

    const evento = (invitacion as any).Evento
    await sendEntradaEmail({
        toEmail: email,
        nombre,
        eventoNombre: evento?.nombre || 'Evento CEM',
        eventoFecha: evento?.fecha ? new Date(evento.fecha).toLocaleDateString('es-AR', {
            weekday: 'long', day: '2-digit', month: 'long', year: 'numeric'
        }) : '',
        token: invitacionToken,
        qrDataUrl
    })
    logger.info('[Invitacion] Entrada con QR enviada tras pago aprobado', { token: invitacionToken })
}

// ─── OG preview: sirve meta tags para WhatsApp y redirige al frontend ────────

// GET /api/invitaciones/og/:token
export const getOgPreview: RequestHandler = async (req: Request, res: Response) => {
    const { token } = req.params
    const frontendUrl = `${FRONTEND_URL}/invitacion/${token}`
    try {
        const invitacion = await Invitacion.findOne({
            where: { token },
            include: [{ model: Evento, as: 'Evento' }]
        })
        const evento = (invitacion as any)?.Evento
        const titulo = evento?.nombre || 'Invitación personal'
        const imagen = evento?.imagen || ''
        const desc = [
            evento?.descripcion || 'Tenés una invitación personal para este evento privado.',
            evento?.fecha ? new Date(evento.fecha).toLocaleDateString('es-AR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC' }) : ''
        ].filter(Boolean).join(' · ')

        const html = `<!DOCTYPE html><html lang="es"><head>
<meta charset="utf-8"/>
<title>${titulo}</title>
<meta property="og:type" content="website"/>
<meta property="og:title" content="🎉 ${titulo}"/>
<meta property="og:description" content="${desc}"/>
${imagen ? `<meta property="og:image" content="${imagen}"/>` : ''}
<meta property="og:url" content="${frontendUrl}"/>
<meta name="twitter:card" content="summary_large_image"/>
<meta name="twitter:title" content="🎉 ${titulo}"/>
<meta name="twitter:description" content="${desc}"/>
${imagen ? `<meta name="twitter:image" content="${imagen}"/>` : ''}
<meta http-equiv="refresh" content="0;url=${frontendUrl}"/>
</head><body>
<script>window.location.replace(${JSON.stringify(frontendUrl)})</script>
<p>Redirigiendo a tu invitación...</p>
</body></html>`

        res.setHeader('Content-Type', 'text/html; charset=utf-8')
        res.setHeader('Cache-Control', 'no-store')
        return res.send(html)
    } catch {
        return res.redirect(frontendUrl)
    }
}

// ─── Legacy: confirmar con nombre+email (para RSVP antiguo sin pago) ─────────

// POST /api/invitaciones/:token/confirmar
export const confirmarAsistencia: RequestHandler = async (req: Request, res: Response) => {
    const { token } = req.params
    const { nombre, email } = req.body

    if (!nombre || !email) {
        return res.status(400).json({ message: 'Nombre y email son obligatorios' })
    }

    try {
        const invitacion = await Invitacion.findOne({
            where: { token },
            include: [{ model: Evento, as: 'Evento' }]
        })

        if (!invitacion) {
            return res.status(404).json({ message: 'Invitación no encontrada o inválida' })
        }

        if (invitacion.estado === 'usada') {
            return res.status(410).json({ message: 'Esta invitación ya fue utilizada.' })
        }

        if (invitacion.estado === 'confirmada') {
            return res.status(409).json({ message: 'Ya confirmaste tu asistencia. Revisá tu correo.' })
        }

        const qrPayload = `${FRONTEND_URL}/validar-entrada?token=${token}`
        const qrDataUrl = await QRCode.toDataURL(qrPayload, {
            width: 280,
            margin: 2,
            color: { dark: '#1a1a2e', light: '#ffffff' }
        })

        await invitacion.update({
            nombre_invitado: nombre,
            email_invitado: email,
            estado: 'confirmada',
            fecha_confirmacion: new Date(),
            qr_data: qrDataUrl
        })

        const evento = (invitacion as any).Evento
        const eventoInfo = evento
            ? { nombre: evento.nombre, fecha: evento.fecha, descripcion: evento.descripcion }
            : { nombre: 'Evento CEM', fecha: '', descripcion: '' }

        await sendEntradaEmail({
            toEmail: email,
            nombre,
            eventoNombre: eventoInfo.nombre,
            eventoFecha: eventoInfo.fecha ? new Date(eventoInfo.fecha).toLocaleDateString('es-AR', {
                weekday: 'long', day: '2-digit', month: 'long', year: 'numeric'
            }) : '',
            token,
            qrDataUrl
        })

        return res.json({
            message: `¡Asistencia confirmada! Revisá tu correo en ${email} para ver tu entrada con QR.`
        })
    } catch (error: any) {
        logger.error('[Invitacion] Error confirmando asistencia', { error: error.message })
        return res.status(500).json({ message: 'Error al confirmar asistencia', error: error.message })
    }
}

// ─── Organizador: validar QR en puerta ───────────────────────────────────────

// POST /api/invitaciones/validar
export const validarQR: RequestHandler = async (req: Request, res: Response) => {
    const { token } = req.body
    const persona = (req as any).persona

    if (!token) {
        return res.status(400).json({ message: 'Token requerido' })
    }

    try {
        const invitacion = await Invitacion.findOne({
            where: { token },
            include: [{ model: Evento, as: 'Evento' }]
        })

        if (!invitacion) {
            return res.status(404).json({ valido: false, message: 'QR no reconocido. No es una invitación válida.' })
        }

        if (invitacion.estado === 'usada') {
            return res.status(409).json({
                valido: false,
                message: 'Este QR ya fue usado. Acceso denegado.',
                nombre_invitado: invitacion.nombre_invitado
            })
        }

        if (invitacion.estado === 'pendiente') {
            return res.status(400).json({
                valido: false,
                message: 'Este invitado no confirmó asistencia.'
            })
        }

        const evento = (invitacion as any).Evento
        const autorizado = await canManageOwnedResource(persona?.id_persona, evento?.creado_por)
        if (!autorizado) {
            return res.status(403).json({
                valido: false,
                message: 'No tenés permiso para validar entradas de este evento.'
            })
        }

        await invitacion.update({ estado: 'usada' })

        return res.json({
            valido: true,
            message: '✅ Acceso habilitado',
            nombre_invitado: invitacion.nombre_invitado,
            email_invitado: invitacion.email_invitado,
            num_invitados: invitacion.num_invitados,
            evento: evento?.nombre || 'Evento CEM',
            fecha_confirmacion: invitacion.fecha_confirmacion
        })
    } catch (error: any) {
        logger.error('[Invitacion] Error validando QR', { error: error.message })
        return res.status(500).json({ message: 'Error del servidor', error: error.message })
    }
}

// ─── Organizador: listar invitaciones de un evento ───────────────────────────

// GET /api/invitaciones/mis-invitaciones/:evento_id
export const getMisInvitaciones: RequestHandler = async (req: Request, res: Response) => {
    const { evento_id } = req.params
    const persona = (req as any).persona

    try {
        const evento = await Evento.findOne({
            where: { id_evento: evento_id, creado_por: persona.id_persona }
        })

        if (!evento) {
            return res.status(404).json({ message: 'Evento no encontrado o no sos el organizador' })
        }

        const invitaciones = await Invitacion.findAll({
            where: { evento_id },
            include: [{ model: InvitadoConfirmado, as: 'InvitadosConfirmados' }],
            order: [['createdAt', 'DESC']]
        })

        return res.json({ invitaciones: invitaciones.map(i => i.toJSON()) })
    } catch (error: any) {
        return res.status(500).json({ message: 'Error al obtener invitaciones', error: error.message })
    }
}
