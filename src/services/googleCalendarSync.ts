import { Op } from 'sequelize';
import Persona from '../models/persona';
import Salon from '../models/salon';
import Reserva from '../models/reserva';
import { decryptToken } from '../config/mercadopago';
import { logger } from '../libs/logger';

// ── Vía A: sincronizar reservas de la app hacia el Google Calendar del dueño ───
// Todo best-effort: si algo falla, se loguea pero NUNCA rompe el flujo de la reserva.

const CID = process.env.GOOGLE_CLIENT_ID || '';
const CSECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const TZ = 'America/Argentina/Buenos_Aires';

const parseDatos = (d: any): any => {
    if (!d) return {};
    if (typeof d === 'object') return d;
    try { return JSON.parse(d); } catch { return {}; }
};

// Access token del dueño a partir de su refresh_token cifrado. null si no está conectado.
async function accessTokenDeDueno(dueno_id: number): Promise<{ token: string; calId: string } | null> {
    const persona = await Persona.findByPk(dueno_id, { attributes: ['google_calendar_token', 'google_calendar_id'] });
    const enc = (persona as any)?.google_calendar_token;
    if (!enc) return null;
    let refresh: string;
    try { refresh = decryptToken(enc); } catch { return null; }
    try {
        const r = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ client_id: CID, client_secret: CSECRET, refresh_token: refresh, grant_type: 'refresh_token' }),
        });
        const d: any = await r.json();
        if (!r.ok || !d.access_token) { logger.warn('[CalSync] refresh_token falló', { d }); return null; }
        return { token: d.access_token, calId: (persona as any).google_calendar_id || 'primary' };
    } catch (e: any) {
        logger.warn('[CalSync] error obteniendo access_token', { error: e.message });
        return null;
    }
}

// ¿Esta reserva debe existir como evento en el calendario? Solo reservas reales:
// pagadas (seña/total) o manuales del dueño. Las pendientes de pago no ensucian el calendar.
const debeEstarEnCalendario = (reserva: any, datos: any): boolean =>
    datos?.manual === true || ['seña_abonada', 'confirmada'].includes(reserva.estado);

function armarEvento(reserva: any, salon: any, datos: any) {
    // reserva.fecha puede ser un objeto Date → normalizar a 'YYYY-MM-DD'
    const fecha = (reserva.fecha instanceof Date ? reserva.fecha.toISOString() : String(reserva.fecha)).slice(0, 10);
    const hi = datos.hora_inicio, hf = datos.hora_fin;
    const nombre = datos.nombre || datos.nombre_organizador || 'Reserva';
    const org = datos.nombre_organizador || datos.nombre || '';

    const evento: any = {
        summary: `📅 ${nombre} — ${salon?.nombre || 'Salón'}`,
        description: [
            org ? `Organizador: ${org}` : null,
            datos.email_organizador ? `Contacto: ${datos.email_organizador}` : null,
            datos.cupo ? `Cupo: ${datos.cupo} personas` : null,
            `Estado: ${reserva.estado}`,
            'Agendado por Dream Events',
        ].filter(Boolean).join('\n'),
        location: [salon?.nombre, salon?.domicilio, salon?.localidad].filter(Boolean).join(', ') || undefined,
        status: 'confirmed',
        transparency: 'opaque', // marca la fecha como OCUPADA
        // Recordatorios / alarmas: 1 día y 2 horas antes
        reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 24 * 60 }, { method: 'popup', minutes: 120 }] },
        extendedProperties: { private: { dreamEventsReservaId: String(reserva.id_reserva) } },
    };

    if (hi && hf) {
        const cruza = hf <= hi;
        const finFecha = cruza
            ? new Date(new Date(fecha + 'T12:00:00').getTime() + 86400000).toISOString().slice(0, 10)
            : fecha;
        evento.start = { dateTime: `${fecha}T${hi}:00`, timeZone: TZ };
        evento.end = { dateTime: `${finFecha}T${hf}:00`, timeZone: TZ };
    } else {
        const finDia = new Date(new Date(fecha + 'T12:00:00').getTime() + 86400000).toISOString().slice(0, 10);
        evento.start = { date: fecha };
        evento.end = { date: finDia };
    }
    return evento;
}

// Crea o actualiza el evento en el calendar del dueño. Guarda el google_event_id en datos_evento.
export async function upsertEventoReserva(reserva: any): Promise<void> {
    try {
        const datos = parseDatos(reserva.datos_evento);
        if (datos.origen === 'google_calendar') return;      // vino de la Vía B, ya está en el calendar
        if (!debeEstarEnCalendario(reserva, datos)) return;

        const salon = await Salon.findByPk(reserva.salon_id, { attributes: ['dueno_id', 'nombre', 'domicilio', 'localidad'] });
        const dueno_id = (salon as any)?.dueno_id;
        if (!dueno_id) return;

        const auth = await accessTokenDeDueno(dueno_id);
        if (!auth) return;                                    // el dueño no conectó su calendar

        const evento = armarEvento(reserva, salon, datos);
        const base = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(auth.calId)}/events`;
        const headers = { Authorization: `Bearer ${auth.token}`, 'Content-Type': 'application/json' };

        if (datos.google_event_id) {
            const r = await fetch(`${base}/${encodeURIComponent(datos.google_event_id)}`, { method: 'PATCH', headers, body: JSON.stringify(evento) });
            if (!r.ok) logger.warn('[CalSync] PATCH evento falló', { status: r.status });
            return;
        }

        const r = await fetch(base, { method: 'POST', headers, body: JSON.stringify(evento) });
        const d: any = await r.json();
        if (!r.ok || !d.id) { logger.warn('[CalSync] POST evento falló', { d }); return; }

        datos.google_event_id = d.id;
        await Reserva.update({ datos_evento: JSON.stringify(datos) }, { where: { id_reserva: reserva.id_reserva } });
    } catch (e: any) {
        logger.warn('[CalSync] upsert error', { error: e.message });
    }
}

// Borra el evento del calendar (al cancelar la reserva) y limpia el id guardado.
export async function borrarEventoReserva(reserva: any): Promise<void> {
    try {
        const datos = parseDatos(reserva.datos_evento);
        if (!datos.google_event_id || datos.origen === 'google_calendar') return;

        const salon = await Salon.findByPk(reserva.salon_id, { attributes: ['dueno_id'] });
        const dueno_id = (salon as any)?.dueno_id;
        if (!dueno_id) return;

        const auth = await accessTokenDeDueno(dueno_id);
        if (!auth) return;

        const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(auth.calId)}/events/${encodeURIComponent(datos.google_event_id)}`;
        const r = await fetch(url, { method: 'DELETE', headers: { Authorization: `Bearer ${auth.token}` } });
        if (!r.ok && r.status !== 404 && r.status !== 410) logger.warn('[CalSync] DELETE evento falló', { status: r.status });

        delete datos.google_event_id;
        await Reserva.update({ datos_evento: JSON.stringify(datos) }, { where: { id_reserva: reserva.id_reserva } });
    } catch (e: any) {
        logger.warn('[CalSync] borrar error', { error: e.message });
    }
}

// Sincroniza TODAS las reservas actuales del salón de un dueño (pagadas/manuales)
// hacia su Google Calendar. Usado por el backfill manual y automáticamente al conectar.
export async function sincronizarTodasLasReservas(dueno_id: number): Promise<{ sincronizadas: number; total: number }> {
    const salon = await Salon.findOne({ where: { dueno_id }, attributes: ['id_salon'] });
    if (!salon) return { sincronizadas: 0, total: 0 };
    const reservas = await Reserva.findAll({
        where: { salon_id: (salon as any).id_salon, estado: { [Op.ne]: 'cancelada' } }
    });
    let sincronizadas = 0;
    for (const r of reservas) {
        const datos = parseDatos((r as any).datos_evento);
        const paidOrManual = datos.manual === true || ['seña_abonada', 'confirmada'].includes((r as any).estado);
        if (datos.origen === 'google_calendar' || !paidOrManual) continue;
        await upsertEventoReserva(r);
        sincronizadas++;
    }
    return { sincronizadas, total: reservas.length };
}
