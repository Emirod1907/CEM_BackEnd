import { Request, RequestHandler, Response } from 'express';
import jwt from 'jsonwebtoken';
import { Op } from 'sequelize';
import Persona from '../models/persona';
import Salon from '../models/salon';
import Reserva from '../models/reserva';
import { encryptToken, decryptToken } from '../config/mercadopago';
import { sincronizarTodasLasReservas } from '../services/googleCalendarSync';
import { logger } from '../libs/logger';

// ── Conexión OAuth con Google Calendar (dueño de salón) ───────────────────────
// Reutiliza las credenciales del proyecto (GOOGLE_CLIENT_ID/SECRET) pero es un
// flujo aparte del login: pide access_type=offline + scope de calendario para
// obtener un refresh_token que guardamos cifrado. Después sincronizamos sin que
// el dueño tenga que volver a autorizar.

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const BACKEND = (process.env.BACKEND_URL || 'http://localhost:8000').replace(/\/$/, '');
const FRONTEND = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');
const REDIRECT_URI = `${BACKEND}/api/salones/google/callback`;
const SCOPE = 'https://www.googleapis.com/auth/calendar.events';
const STATE_SECRET = process.env.JWT_SECRET || 'dream-cal-state';

// GET /api/salones/google/connect — redirige a la pantalla de consentimiento de Google
export const googleCalendarConnect: RequestHandler = (req: Request, res: Response) => {
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
        return res.status(500).json({ message: 'Google OAuth no está configurado en el servidor' });
    }
    const pid = req.persona!.id_persona;
    // state firmado: identifica al dueño en el callback sin depender de la cookie
    const state = jwt.sign({ pid }, STATE_SECRET, { expiresIn: '10m' });
    const params = new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        redirect_uri: REDIRECT_URI,
        response_type: 'code',
        scope: SCOPE,
        access_type: 'offline',   // pide refresh_token
        prompt: 'consent',        // fuerza el refresh_token aunque ya haya autorizado antes
        include_granted_scopes: 'true',
        state,
    });
    return res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
};

// GET /api/salones/google/callback — Google redirige acá con el code; guardamos el refresh_token
export const googleCalendarCallback: RequestHandler = async (req: Request, res: Response) => {
    const back = (estado: string) => `${FRONTEND}/mi-salon?calendar=${estado}`;
    const { code, state, error } = req.query as Record<string, string>;

    if (error) return res.redirect(back('cancelado'));
    if (!code || !state) return res.redirect(back('error'));

    let pid: number;
    try {
        pid = (jwt.verify(String(state), STATE_SECRET) as any).pid;
    } catch {
        return res.redirect(back('error'));
    }

    try {
        const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                code: String(code),
                client_id: GOOGLE_CLIENT_ID,
                client_secret: GOOGLE_CLIENT_SECRET,
                redirect_uri: REDIRECT_URI,
                grant_type: 'authorization_code',
            }),
        });
        const data: any = await tokenRes.json();

        if (!tokenRes.ok) {
            logger.warn('[Calendar] Intercambio de code falló', { data });
            return res.redirect(back('error'));
        }
        if (!data.refresh_token) {
            // Google solo manda refresh_token la primera vez; con prompt=consent debería venir siempre
            logger.warn('[Calendar] Sin refresh_token en la respuesta');
            return res.redirect(back('sin_refresh'));
        }

        const persona = await Persona.findByPk(pid);
        if (!persona) return res.redirect(back('error'));

        await persona.update({
            google_calendar_token: encryptToken(data.refresh_token),
            google_calendar_id: 'primary',
        });
        logger.info('[Calendar] Google Calendar conectado', { persona_id: pid });
        // Al conectar (primera vez) se hace TODO automático, best-effort:
        //  1) importar los eventos del calendar → bloquear esas fechas en la app (Vía B)
        //  2) empujar las reservas actuales de la app → al calendar (Vía A)
        // De ahí en más, cada reserva nueva se sincroniza sola por los hooks.
        (async () => {
            try { await importarEventosDelDueno(persona); } catch (e: any) { logger.warn('[Calendar] auto-import falló', { error: e.message }); }
            try { await sincronizarTodasLasReservas(pid); } catch (e: any) { logger.warn('[Calendar] auto-backfill falló', { error: e.message }); }
        })();
        return res.redirect(back('conectado'));
    } catch (e: any) {
        logger.error('[Calendar] Error en callback', { error: e.message });
        return res.redirect(back('error'));
    }
};

// GET /api/salones/google/status — ¿el dueño tiene el calendario conectado?
export const googleCalendarStatus: RequestHandler = async (req: Request, res: Response) => {
    try {
        const persona = await Persona.findByPk(req.persona!.id_persona, { attributes: ['google_calendar_token'] });
        return res.json({ connected: !!(persona as any)?.google_calendar_token });
    } catch (e: any) {
        return res.status(500).json({ message: 'Error al consultar el estado', error: e.message });
    }
};

// POST /api/salones/google/disconnect — desvincula el calendario
export const googleCalendarDisconnect: RequestHandler = async (req: Request, res: Response) => {
    try {
        const persona = await Persona.findByPk(req.persona!.id_persona);
        if (persona) {
            await persona.update({ google_calendar_token: null, google_calendar_id: null });
        }
        return res.json({ ok: true });
    } catch (e: any) {
        return res.status(500).json({ message: 'Error al desconectar', error: e.message });
    }
};

// ── Vía B: importar el Google Calendar del dueño para bloquear fechas (punto cero) ──
// Usa el refresh_token para obtener un access_token y leer los eventos.
async function getAccessToken(refreshToken: string): Promise<string | null> {
    const r = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            client_id: GOOGLE_CLIENT_ID,
            client_secret: GOOGLE_CLIENT_SECRET,
            refresh_token: refreshToken,
            grant_type: 'refresh_token',
        }),
    });
    const data: any = await r.json();
    if (!r.ok) { logger.error('[Calendar] refresh_token falló', { data }); return null; }
    return data.access_token || null;
}

// Lee el Google Calendar del dueño y bloquea esas fechas en la app (punto cero).
// Idempotente: si la fecha ya tiene reserva/bloqueo activo, se saltea. Devuelve conteos.
export async function importarEventosDelDueno(persona: any): Promise<{ importadas: number; salteadas: number; total: number }> {
    const salon = await Salon.findOne({ where: { dueno_id: persona.id_persona } });
    if (!salon || !persona.google_calendar_token) return { importadas: 0, salteadas: 0, total: 0 };

    const refresh = decryptToken(persona.google_calendar_token);
    const accessToken = await getAccessToken(refresh);
    if (!accessToken) throw new Error('No se pudo autenticar con Google');

    const calId = encodeURIComponent(persona.google_calendar_id || 'primary');
    const timeMin = new Date(); timeMin.setHours(0, 0, 0, 0);
    const timeMax = new Date(timeMin); timeMax.setFullYear(timeMax.getFullYear() + 1);
    const url = `https://www.googleapis.com/calendar/v3/calendars/${calId}/events?` + new URLSearchParams({
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
        singleEvents: 'true',
        orderBy: 'startTime',
        maxResults: '2500',
    }).toString();

    const evRes = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    const evData: any = await evRes.json();
    if (!evRes.ok) { logger.error('[Calendar] events.list falló', { evData }); throw new Error('No se pudo leer el calendario'); }

    const items: any[] = evData.items || [];
    const fechasAOcupar = new Map<string, string>();
    for (const ev of items) {
        if (ev.status === 'cancelled') continue;
        if (ev.transparency === 'transparent') continue; // "libre" no bloquea
        const inicio = ev.start?.date || ev.start?.dateTime;
        if (!inicio) continue;
        const titulo = ev.summary || 'Evento (Google Calendar)';
        const dStart = new Date(String(inicio).slice(0, 10) + 'T12:00:00');
        const finRaw = ev.end?.date || ev.end?.dateTime;
        const dEnd = finRaw ? new Date(String(finRaw).slice(0, 10) + 'T12:00:00') : new Date(dStart);
        if (ev.start?.date) dEnd.setDate(dEnd.getDate() - 1); // all-day: fin exclusivo
        for (const d = new Date(dStart); d <= dEnd; d.setDate(d.getDate() + 1)) {
            const key = d.toISOString().slice(0, 10);
            if (!fechasAOcupar.has(key)) fechasAOcupar.set(key, titulo);
        }
    }

    let importadas = 0, salteadas = 0;
    for (const [fecha, titulo] of fechasAOcupar) {
        const existe = await Reserva.findOne({ where: { salon_id: salon.id_salon, fecha, estado: { [Op.ne]: 'cancelada' } } });
        if (existe) { salteadas++; continue; }
        try {
            await Reserva.create({
                salon_id: salon.id_salon,
                fecha,
                persona_id: persona.id_persona,
                evento_id: null as any,
                estado: 'confirmada',
                datos_evento: JSON.stringify({
                    manual: true, tipo_registro: 'bloqueo', bloqueo: true,
                    origen: 'google_calendar', nombre_organizador: 'Google Calendar',
                    tipo_evento: 'Bloqueo (Google Calendar)', motivo_bloqueo: titulo,
                }),
                monto_alquiler: 0,
                fecha_limite_pago: null as any,
            });
            importadas++;
        } catch { salteadas++; }
    }
    logger.info('[Calendar] Import punto cero', { persona_id: persona.id_persona, importadas, salteadas });
    return { importadas, salteadas, total: fechasAOcupar.size };
}

// POST /api/salones/google/importar — endpoint manual (opcional) del import
export const importarCalendario: RequestHandler = async (req: Request, res: Response) => {
    try {
        const persona = await Persona.findByPk(req.persona!.id_persona);
        if (!persona || !persona.google_calendar_token) {
            return res.status(400).json({ message: 'Primero conectá tu Google Calendar' });
        }
        const r = await importarEventosDelDueno(persona);
        return res.json(r);
    } catch (e: any) {
        logger.error('[Calendar] Error al importar', { error: e.message });
        return res.status(500).json({ message: 'Error al importar el calendario', error: e.message });
    }
};

// POST /api/salones/google/sync-reservas — empuja al calendar las reservas actuales del
// salón (pagadas o manuales) que todavía no están agendadas. Backfill de la Vía A.
export const sincronizarReservasExistentes: RequestHandler = async (req: Request, res: Response) => {
    try {
        const persona = await Persona.findByPk(req.persona!.id_persona, { attributes: ['id_persona', 'google_calendar_token'] });
        if (!persona || !(persona as any).google_calendar_token) {
            return res.status(400).json({ message: 'Primero conectá tu Google Calendar' });
        }
        const r = await sincronizarTodasLasReservas(persona.id_persona);
        return res.json(r);
    } catch (e: any) {
        logger.error('[Calendar] Error al sincronizar reservas', { error: e.message });
        return res.status(500).json({ message: 'Error al sincronizar las reservas', error: e.message });
    }
};
