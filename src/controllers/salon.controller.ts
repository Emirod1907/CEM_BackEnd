import { Request, RequestHandler, Response } from "express";
import Salon from "../models/salon";
import Reserva from "../models/reserva";
import Persona from "../models/persona";
import Contrato from "../models/contrato";
import { Op } from 'sequelize';
import { logger } from "../libs/logger";
import { sendServiciosNotificacion } from '../services/email.service';
import { calcularMontoAlquiler } from './reserva.controller';
import { canManageOwnedResource } from '../services/authz.service';

// Aplica la comisión del cliente (frozen en el contrato vigente del dueño) al precio base.
// Devuelve el precio que ve y paga el cliente final.
async function calcularPrecioPublico(precio_alquiler: number, dueno_id: number | null): Promise<number> {
    if (!dueno_id) return precio_alquiler
    try {
        const contrato = await Contrato.findOne({
            where: { persona_id: dueno_id, estado: 'vigente', ambito: 'salon' },
            attributes: ['comision_cliente_porcentaje'],
        })
        const pct = contrato ? Number(contrato.comision_cliente_porcentaje) : 0
        return +( precio_alquiler * (1 + pct / 100) ).toFixed(2)
    } catch {
        return precio_alquiler
    }
}

export const crearSalon: RequestHandler = async(req: Request, res: Response)=>{

    logger.debug('[Salon] crearSalon llamado', { method: req.method, url: req.url });

    const { nombre, domicilio, departamento, localidad, provincia, servicios_incluidos, tipos_evento, tipo_salon, imagen, aforo, precio_alquiler, latitud, longitud } = req.body

    try {
        if (!nombre || !domicilio || !aforo) {
            return res.status(400).json({message: "Nombre, domicilio y aforo son requeridos"});
        }
        if (precio_alquiler === undefined || precio_alquiler === null || precio_alquiler === '') {
            return res.status(400).json({ message: "El precio de alquiler es requerido" });
        }
        const existingSalon = await Salon.findOne({where: {nombre}});
        if(existingSalon){
            return res.status(400).json({message: "El Salón ya existe"});
        }

        const newSalon = await Salon.create({
            nombre,
            domicilio,
            departamento: departamento || null,
            localidad: localidad || null,
            provincia: provincia || null,
            servicios_incluidos: Array.isArray(servicios_incluidos) ? JSON.stringify(servicios_incluidos) : (servicios_incluidos || null),
            tipos_evento: Array.isArray(tipos_evento) ? JSON.stringify(tipos_evento) : (tipos_evento || null),
            tipo_salon: tipo_salon || null,
            imagen: imagen || '',
            aforo: parseInt(aforo),
            precio_alquiler: parseFloat(precio_alquiler),
            latitud: latitud ? parseFloat(latitud) : null,
            longitud: longitud ? parseFloat(longitud) : null,
            dueno_id: req.persona!.id_persona,
        });
        res.json({
            msg: "Salón creado con éxito",
            salon: {
                id_salon: newSalon.id_salon,
                nombre: newSalon.nombre,
                domicilio: newSalon.domicilio,
                precio_alquiler: newSalon.precio_alquiler
            }
        })
    } catch (error: any) {
        logger.error('[Salon] Error al crear salón', { error: error.message });
        res.status(500).json({
            message:"error interno del servidor",
            error: error.message
        })
    }
}

export const getMiSalon: RequestHandler = async (req: Request, res: Response) => {
    try {
        const salon = await Salon.findOne({ where: { dueno_id: req.persona!.id_persona } });
        if (!salon) return res.status(404).json({ message: 'No tenés un salón registrado' });
        res.json({ salon });
    } catch (error: any) {
        logger.error('[Salon] Error al obtener mi salón', { error: error.message });
        res.status(500).json({ message: 'Error interno del servidor', error: error.message });
    }
};

// ── Exportación a Google Calendar (iCalendar / .ics) ──────────────────────────
// Fase 1: genera un archivo .ics con todas las reservas activas del salón como
// eventos "ocupados", para importarlo a Google Calendar y bloquear esas fechas.
const escIcs = (s: any): string =>
    String(s ?? '')
        .replace(/\\/g, '\\\\')
        .replace(/;/g, '\\;')
        .replace(/,/g, '\\,')
        .replace(/\r?\n/g, '\\n');

const soloFecha = (f: any): string => String(f).slice(0, 10);           // YYYY-MM-DD
const compactaFecha = (f: any): string => soloFecha(f).replace(/-/g, ''); // YYYYMMDD
const compactaHora = (hhmm: string): string => `${String(hhmm).replace(':', '')}00`; // HHMMSS
const sumarUnDia = (f: any): string => {
    const d = new Date(soloFecha(f) + 'T12:00:00');
    d.setDate(d.getDate() + 1);
    return compactaFecha(d.toISOString());
};
const stampUTC = (): string => new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');

function generarICS(salon: any, reservas: any[]): string {
    const nombreCal = `Reservas — ${salon?.nombre || 'Mi salón'}`;
    const lineas: string[] = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//Dream Events//Reservas Salon//ES',
        'CALSCALE:GREGORIAN',
        'METHOD:PUBLISH',
        `X-WR-CALNAME:${escIcs(nombreCal)}`,
        'X-WR-TIMEZONE:America/Argentina/Buenos_Aires',
    ];

    for (const r of reservas) {
        const de: any = r.datos_evento || {};
        const nombreEvento = de.nombre || 'Reserva de salón';
        const organizador = [r.Persona?.nombre, r.Persona?.apellido].filter(Boolean).join(' ').trim();
        const pendiente = r.estado === 'pendiente_pago';
        const hi = de.hora_inicio, hf = de.hora_fin;

        lineas.push('BEGIN:VEVENT');
        lineas.push(`UID:reserva-${r.id_reserva}@dreamevents`);
        lineas.push(`DTSTAMP:${stampUTC()}`);

        if (hi && hf) {
            // Con horario: evento con hora (tiempo local flotante — Google lo interpreta en la TZ del calendario)
            lineas.push(`DTSTART:${compactaFecha(r.fecha)}T${compactaHora(hi)}`);
            const cruzaMedianoche = hf <= hi;
            const fechaFin = cruzaMedianoche ? sumarUnDia(r.fecha) : compactaFecha(r.fecha);
            lineas.push(`DTEND:${fechaFin}T${compactaHora(hf)}`);
        } else {
            // Sin horario: bloquea el día completo
            lineas.push(`DTSTART;VALUE=DATE:${compactaFecha(r.fecha)}`);
            lineas.push(`DTEND;VALUE=DATE:${sumarUnDia(r.fecha)}`);
        }

        lineas.push(`SUMMARY:${escIcs((pendiente ? '🕒 Reservado (pend. pago) — ' : '✅ Reservado — ') + nombreEvento)}`);
        const desc = [
            organizador ? `Organizador: ${organizador}` : null,
            r.Persona?.email ? `Contacto: ${r.Persona.email}` : null,
            `Estado: ${r.estado}`,
            de.cupo ? `Cupo: ${de.cupo} personas` : null,
        ].filter(Boolean).join('\\n');
        if (desc) lineas.push(`DESCRIPTION:${escIcs(desc).replace(/\\\\n/g, '\\n')}`);
        if (salon?.domicilio) lineas.push(`LOCATION:${escIcs([salon.nombre, salon.domicilio, salon.localidad].filter(Boolean).join(', '))}`);
        lineas.push(`STATUS:${pendiente ? 'TENTATIVE' : 'CONFIRMED'}`);
        lineas.push('TRANSP:OPAQUE'); // marca la fecha como OCUPADA (bloquea)
        lineas.push('END:VEVENT');
    }

    lineas.push('END:VCALENDAR');
    // CRLF es lo que exige el estándar iCalendar
    return lineas.join('\r\n') + '\r\n';
}

// GET /api/salones/mi-salon/reservas.ics — descarga las reservas del salón como calendario
export const exportarReservasICS: RequestHandler = async (req: Request, res: Response) => {
    try {
        const salon = await Salon.findOne({ where: { dueno_id: req.persona!.id_persona } });
        if (!salon) return res.status(404).json({ message: 'No tenés un salón registrado' });

        const reservas = await Reserva.findAll({
            where: { salon_id: salon.id_salon, estado: { [Op.ne]: 'cancelada' } },
            include: [{ model: Persona, as: 'Persona', attributes: ['nombre', 'apellido', 'email'] }],
            order: [['fecha', 'ASC']]
        });

        const parsed = reservas.map(r => {
            const json = r.toJSON() as any;
            json.datos_evento = r.datos_evento ? (() => { try { return JSON.parse(r.datos_evento!) } catch { return {} } })() : {};
            return json;
        });

        const ics = generarICS(salon.toJSON(), parsed);
        res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="reservas-${(salon as any).nombre || 'salon'}.ics"`);
        return res.send(ics);
    } catch (error: any) {
        logger.error('[Salon] Error al exportar reservas .ics', { error: error.message });
        return res.status(500).json({ message: 'Error al exportar el calendario', error: error.message });
    }
};

// GET /api/salones/mi-salon/reservas
export const getMiSalonReservas: RequestHandler = async (req: Request, res: Response) => {
    try {
        const salon = await Salon.findOne({ where: { dueno_id: req.persona!.id_persona } });
        if (!salon) return res.status(404).json({ message: 'No tenés un salón registrado' });

        const reservas = await Reserva.findAll({
            where: { salon_id: salon.id_salon },
            include: [
                { model: Persona, as: 'Persona', attributes: ['nombre', 'apellido', 'email'] }
            ],
            order: [['fecha', 'ASC']]
        });

        const resultado = reservas.map(r => {
            const json = r.toJSON() as any;
            return {
                ...json,
                datos_evento: r.datos_evento ? (() => { try { return JSON.parse(r.datos_evento!) } catch { return null } })() : null,
                monto_sena: +(Number(r.monto_alquiler) * 0.30).toFixed(2)
            };
        });

        return res.json({ reservas: resultado });
    } catch (error: any) {
        logger.error('[Salon] Error al obtener reservas del salón', { error: error.message });
        return res.status(500).json({ message: 'Error al obtener reservas', error: error.message });
    }
};

// PUT /api/salones/mi-salon/precios
export const actualizarPreciosSalon: RequestHandler = async (req: Request, res: Response) => {
    try {
        const { precios_config } = req.body;
        if (!precios_config) return res.status(400).json({ message: 'precios_config es requerido' });

        const salon = await Salon.findOne({ where: { dueno_id: req.persona!.id_persona } });
        if (!salon) return res.status(404).json({ message: 'No tenés un salón registrado' });

        const configStr = typeof precios_config === 'string' ? precios_config : JSON.stringify(precios_config);
        await salon.update({ precios_config: configStr });

        return res.json({ message: 'Precios actualizados correctamente' });
    } catch (error: any) {
        logger.error('[Salon] Error al actualizar precios', { error: error.message });
        return res.status(500).json({ message: 'Error al actualizar precios', error: error.message });
    }
};

// POST /api/salones/mi-salon/reservas/manual
export const crearReservaManual: RequestHandler = async (req: Request, res: Response) => {
    const {
        fecha,
        tipo_registro = 'reserva',
        nombre_organizador,
        email_organizador,
        telefono_organizador,
        tipo_evento,
        cantidad_invitados,
        monto_alquiler,
        estado,
        motivo_bloqueo,
        notas,
        enviar_notificacion
    } = req.body;

    if (!fecha) return res.status(400).json({ message: 'La fecha es requerida' });

    const esBloqueo = tipo_registro === 'bloqueo';
    const estadosValidos = ['pendiente_pago', 'seña_abonada', 'confirmada', 'cancelada'];
    if (estado && !estadosValidos.includes(estado)) {
        return res.status(400).json({ message: 'Estado inválido' });
    }

    try {
        const salon = await Salon.findOne({ where: { dueno_id: req.persona!.id_persona } });
        if (!salon) return res.status(404).json({ message: 'No tenés un salón registrado' });

        // Verificar que no haya reserva activa en esa fecha. Los bloqueos se guardan
        // como reservas manuales confirmadas con marca en datos_evento, sin cambiar
        // el ENUM de la columna estado. Así no requiere migración de base de datos.
        const reservaExistente = await Reserva.findOne({
            where: {
                salon_id: salon.id_salon,
                fecha,
                estado: { [Op.ne]: 'cancelada' }
            }
        });
        if (reservaExistente) {
            return res.status(409).json({ message: 'Ya existe una reserva activa en esa fecha' });
        }

        const montoBase = esBloqueo
            ? 0
            : (monto_alquiler !== undefined && monto_alquiler !== null && monto_alquiler !== ''
                ? Number(monto_alquiler)
                : Number(salon.precio_alquiler) || 0);

        const datos_evento = JSON.stringify({
            manual: true,
            tipo_registro: esBloqueo ? 'bloqueo' : 'reserva',
            bloqueo: esBloqueo,
            nombre_organizador: esBloqueo ? 'Fecha bloqueada' : (nombre_organizador || 'Sin nombre'),
            email_organizador: esBloqueo ? null : (email_organizador || null),
            telefono_organizador: esBloqueo ? null : (telefono_organizador || null),
            tipo_evento: esBloqueo ? 'Bloqueo de agenda' : (tipo_evento || null),
            cantidad_invitados: esBloqueo ? null : (cantidad_invitados || null),
            motivo_bloqueo: esBloqueo ? (motivo_bloqueo || notas || 'Bloqueo de agenda') : null,
            notas: notas || null,
        });

        const reserva = await Reserva.create({
            salon_id: salon.id_salon,
            fecha,
            persona_id: req.persona!.id_persona,
            evento_id: null as any,
            estado: esBloqueo ? 'confirmada' : (estado || 'confirmada'),
            datos_evento,
            monto_alquiler: montoBase,
            fecha_limite_pago: null as any,
        });

        // Enviar notificación si corresponde y solo si es una reserva manual real.
        if (!esBloqueo && enviar_notificacion && email_organizador) {
            const fechaFormateada = new Date(fecha).toLocaleDateString('es-AR', {
                weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
            });
            sendServiciosNotificacion(
                email_organizador,
                nombre_organizador || 'Cliente',
                salon.nombre,
                fechaFormateada,
            ).catch(err => logger.error('[Salon] Error al enviar notificación de servicios', { error: String(err) }));
        }

        return res.status(201).json({
            message: esBloqueo ? 'Fecha bloqueada correctamente' : 'Reserva manual creada correctamente',
            reserva
        });
    } catch (error: any) {
        logger.error('[Salon] Error al crear reserva manual', { error: error.message });
        return res.status(500).json({ message: 'Error al crear la reserva', error: error.message });
    }
};

// PUT /api/salones/mi-salon/reservas/:id/estado
export const gestionarReservaDueno: RequestHandler = async (req: Request, res: Response) => {
    const { id } = req.params;
    const { estado } = req.body;

    if (!['confirmada', 'cancelada'].includes(estado)) {
        return res.status(400).json({ message: 'Estado inválido. Valores permitidos: confirmada, cancelada.' });
    }

    try {
        const salon = await Salon.findOne({ where: { dueno_id: req.persona!.id_persona } });
        if (!salon) return res.status(404).json({ message: 'No tenés un salón registrado' });

        const reserva = await Reserva.findOne({ where: { id_reserva: id, salon_id: salon.id_salon } });
        if (!reserva) return res.status(404).json({ message: 'Reserva no encontrada en tu salón' });

        await reserva.update({ estado });
        return res.json({ message: `Reserva ${estado === 'confirmada' ? 'confirmada' : 'cancelada'} exitosamente` });
    } catch (error: any) {
        logger.error('[Salon] Error al gestionar reserva', { error: error.message });
        return res.status(500).json({ message: 'Error al gestionar reserva', error: error.message });
    }
};

export const getSalones: RequestHandler = async(req: Request, res: Response)=>{
    try {
        const salones = await Salon.findAll()
        const response = await Promise.all(
            salones.map(async (s) => ({
                ...s.toJSON(),
                precio_publico: await calcularPrecioPublico(Number(s.precio_alquiler), s.dueno_id),
            }))
        )
        res.json({response})
    } catch (error) {
        logger.error('[Salon] Error', { error: String(error) })
    }
}

export const getSalon: RequestHandler = async(req: Request, res: Response)=>{
    const { id } = req.params
    try {
        const salon = await Salon.findByPk(id)
        if (!salon) return res.status(404).json({ message: 'Salón no encontrado' })
        const response = {
            ...salon.toJSON(),
            precio_publico: await calcularPrecioPublico(Number(salon.precio_alquiler), salon.dueno_id),
        }
        return res.json({response})
    } catch (error) {
        logger.error('[Salon] Error al obtener salón', { error: String(error) })
        return res.status(500).json({ message: 'Error al obtener salón' })
    }
}


export const updateSalon: RequestHandler = async(req: Request, res: Response)=>{
    const { id } = req.params
    const { nombre, domicilio, departamento, localidad, provincia, servicios_incluidos, tipos_evento, tipo_salon, imagen, aforo, precio_alquiler, latitud, longitud } = req.body
    try {
        const salon = await Salon.findByPk(id)
        if (!salon) {
            return res.status(404).json({ message: 'Salón no encontrado' })
        }

        const autorizado = await canManageOwnedResource(req.persona?.id_persona, salon.dueno_id)
        if (!autorizado) {
            return res.status(403).json({ message: 'No tenés permiso para modificar este salón' })
        }

        await salon.update({
            ...(nombre !== undefined && { nombre }),
            ...(domicilio !== undefined && { domicilio }),
            ...(departamento !== undefined && { departamento: departamento || null }),
            ...(localidad !== undefined && { localidad: localidad || null }),
            ...(provincia !== undefined && { provincia: provincia || null }),
            ...(servicios_incluidos !== undefined && { servicios_incluidos: Array.isArray(servicios_incluidos) ? JSON.stringify(servicios_incluidos) : (servicios_incluidos || null) }),
            ...(tipos_evento !== undefined && { tipos_evento: Array.isArray(tipos_evento) ? JSON.stringify(tipos_evento) : (tipos_evento || null) }),
            ...(tipo_salon !== undefined && { tipo_salon: tipo_salon || null }),
            ...(imagen !== undefined && { imagen }),
            ...(aforo !== undefined && { aforo: parseInt(aforo) }),
            ...(precio_alquiler !== undefined && { precio_alquiler: parseFloat(precio_alquiler) }),
            ...(latitud !== undefined && { latitud: latitud ? parseFloat(latitud) : null }),
            ...(longitud !== undefined && { longitud: longitud ? parseFloat(longitud) : null }),
        })
        return res.json({ message: 'Salón actualizado con éxito', salon: salon.toJSON() })
    } catch (error: any) {
        logger.error('[Salon] Error al actualizar salón', { error: String(error) })
        return res.status(500).json({ message: 'Error al actualizar salón', error: error.message })
    }
}

export const deleteSalon: RequestHandler = async(req: Request, res: Response)=>{
    const { id } = req.params
    try {
        const salon = await Salon.findByPk(id)
        if (!salon) return res.status(404).json({ message: 'Salón no encontrado' })

        const autorizado = await canManageOwnedResource(req.persona?.id_persona, salon.dueno_id)
        if (!autorizado) {
            return res.status(403).json({ message: 'No tenés permiso para eliminar este salón' })
        }

        const reservasActivas = await Reserva.count({
            where: { salon_id: salon.id_salon, estado: { [Op.ne]: 'cancelada' } }
        })

        if (reservasActivas > 0) {
            return res.status(409).json({ message: 'No se puede eliminar un salón con reservas activas' })
        }

        await salon.destroy()
        return res.json({ message: 'Salón eliminado correctamente' })
    } catch (error: any) {
        logger.error('[Salon] Error al eliminar salón', { error: String(error) })
        return res.status(500).json({ message: 'Error al eliminar salón', error: error.message })
    }
}

// GET /api/salones/disponibles?fecha=YYYY-MM-DD
// Devuelve todos los salones que NO tienen reserva activa en esa fecha
export const getSalonesDisponibles: RequestHandler = async(req: Request, res: Response)=>{
    const { fecha } = req.query
    if (!fecha || typeof fecha !== 'string') {
        return res.status(400).json({ message: 'El parámetro fecha es requerido (YYYY-MM-DD)' })
    }
    try {
        // IDs de salones ocupados en esa fecha
        const reservasOcupadas = await Reserva.findAll({
            where: { fecha, estado: { [Op.ne]: 'cancelada' } },
            attributes: ['salon_id']
        })
        const idsOcupados = reservasOcupadas.map(r => r.salon_id)

        const salones = await Salon.findAll({
            where: idsOcupados.length > 0 ? { id_salon: { [Op.notIn]: idsOcupados } } : {}
        })
        // Duración opcional del evento (para salones por hora / por tramos)
        const horas = Number(req.query.horas) || 1
        const response = await Promise.all(
            salones.map(async (s) => {
                // Precio del alquiler para ESA fecha (aplica feriado/finde/%/tramos),
                // y luego la comisión para obtener el precio público
                const montoFecha = calcularMontoAlquiler(Number(s.precio_alquiler) || 0, s.precios_config, fecha, horas)
                return {
                    ...s.toJSON(),
                    precio_publico: await calcularPrecioPublico(montoFecha, s.dueno_id),
                }
            })
        )
        res.json(response)
    } catch (error) {
        logger.error('[Salon] Error al obtener salones disponibles', { error: String(error) })
        res.status(500).json({ message: 'Error al obtener salones disponibles' })
    }
}

export const getDisponibilidadSalon: RequestHandler = async(req: Request, res: Response)=>{
    const { id } = req.params
    try {
        const reservas = await Reserva.findAll({
            where: { salon_id: id, estado: { [Op.ne]: 'cancelada' } },
            attributes: ['fecha']
        })
        const fechasReservadas = reservas.map(r => {
            const d = new Date(r.fecha)
            return d.toISOString().split('T')[0]
        })
        res.json({ fechasReservadas })
    } catch (error) {
        logger.error('[Salon] Error', { error: String(error) })
        res.status(500).json({ message: 'Error al obtener disponibilidad del salón' })
    }
}
