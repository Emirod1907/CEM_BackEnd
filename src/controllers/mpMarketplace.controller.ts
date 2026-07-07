import { Request, RequestHandler, Response } from 'express'
import jwt from 'jsonwebtoken'
import Persona from '../models/persona'
import { encryptToken, getMpCredentials } from '../config/mercadopago'
import { logger } from '../libs/logger'

// ── Conexión OAuth con MercadoPago Marketplace (vendedor: dueño de salón) ─────
// Mismo patrón que el OAuth del Google Calendar: el vendedor autoriza a Dream
// Events a cobrar en su nombre. Guardamos su access_token + refresh_token cifrados
// y su collector_id (user_id) para hacer el split en el momento del cobro.

const BACKEND = (process.env.BACKEND_URL || 'http://localhost:8000').replace(/\/$/, '')
const FRONTEND = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '')
const REDIRECT_URI = `${BACKEND}/api/salones/mp/callback`
const STATE_SECRET = process.env.JWT_SECRET || 'dream-mp-state'

// Credenciales de la aplicación Marketplace (clientId/clientSecret de MP)
function appCredentials(): { clientId: string; clientSecret: string } {
    const { clientId, clientSecret } = getMpCredentials()
    return { clientId, clientSecret }
}

// GET /api/salones/mp/connect — redirige a la autorización de MercadoPago
export const mpConnect: RequestHandler = (req: Request, res: Response) => {
    const { clientId, clientSecret } = appCredentials()
    if (!clientId || !clientSecret) {
        return res.status(500).json({ message: 'MercadoPago Marketplace no está configurado (falta client_id/client_secret).' })
    }
    const pid = req.persona!.id_persona
    const state = jwt.sign({ pid }, STATE_SECRET, { expiresIn: '10m' })
    const params = new URLSearchParams({
        client_id: clientId,
        response_type: 'code',
        platform_id: 'mp',
        redirect_uri: REDIRECT_URI,
        state,
    })
    return res.redirect(`https://auth.mercadopago.com.ar/authorization?${params.toString()}`)
}

// GET /api/salones/mp/callback — MP redirige con el code; intercambiamos por tokens
export const mpCallback: RequestHandler = async (req: Request, res: Response) => {
    const back = (estado: string) => `${FRONTEND}/mi-salon?mp=${estado}`
    const { code, state, error } = req.query as Record<string, string>

    if (error) return res.redirect(back('cancelado'))
    if (!code || !state) return res.redirect(back('error'))

    let pid: number
    try {
        pid = (jwt.verify(String(state), STATE_SECRET) as any).pid
    } catch {
        return res.redirect(back('error'))
    }

    try {
        const { clientId, clientSecret } = appCredentials()
        const tokenRes = await fetch('https://api.mercadopago.com/oauth/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify({
                client_id: clientId,
                client_secret: clientSecret,
                code: String(code),
                grant_type: 'authorization_code',
                redirect_uri: REDIRECT_URI,
            }),
        })
        const data: any = await tokenRes.json()

        if (!tokenRes.ok || !data.access_token) {
            logger.warn('[MP Marketplace] Intercambio de code falló', { data })
            return res.redirect(back('error'))
        }

        const persona = await Persona.findByPk(pid)
        if (!persona) return res.redirect(back('error'))

        await persona.update({
            mp_access_token: encryptToken(String(data.access_token)),
            mp_refresh_token: data.refresh_token ? encryptToken(String(data.refresh_token)) : null,
            mp_user_id: data.user_id ? String(data.user_id) : null,
        })
        logger.info('[MP Marketplace] Vendedor conectado', { persona_id: pid, mp_user_id: data.user_id })
        return res.redirect(back('conectado'))
    } catch (e: any) {
        logger.error('[MP Marketplace] Error en callback', { error: e.message })
        return res.redirect(back('error'))
    }
}

// GET /api/salones/mp/status — ¿el vendedor tiene MercadoPago conectado?
export const mpStatus: RequestHandler = async (req: Request, res: Response) => {
    try {
        const persona = await Persona.findByPk(req.persona!.id_persona, { attributes: ['mp_access_token', 'mp_user_id'] })
        return res.json({
            connected: !!(persona as any)?.mp_access_token,
            mp_user_id: (persona as any)?.mp_user_id ?? null,
        })
    } catch (e: any) {
        return res.status(500).json({ message: 'Error al consultar el estado', error: e.message })
    }
}

// POST /api/salones/mp/disconnect — desvincula la cuenta de MercadoPago
export const mpDisconnect: RequestHandler = async (req: Request, res: Response) => {
    try {
        const persona = await Persona.findByPk(req.persona!.id_persona)
        if (!persona) return res.status(404).json({ message: 'Persona no encontrada' })
        await persona.update({ mp_access_token: null, mp_refresh_token: null, mp_user_id: null })
        logger.info('[MP Marketplace] Vendedor desconectado', { persona_id: req.persona!.id_persona })
        return res.json({ message: 'MercadoPago desvinculado' })
    } catch (e: any) {
        return res.status(500).json({ message: 'Error al desvincular', error: e.message })
    }
}
