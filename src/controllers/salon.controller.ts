import { Request, RequestHandler, Response } from "express";
import Salon from "../models/salon";
import Reserva from "../models/reserva";
import Persona from "../models/persona";
import Contrato from "../models/contrato";
import { Op } from 'sequelize';
import { logger } from "../libs/logger";
import { sendServiciosNotificacion } from '../services/email.service';
import { calcularMontoAlquiler } from './reserva.controller';

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
    const { fecha, nombre_organizador, email_organizador, tipo_evento, estado, notas, enviar_notificacion } = req.body;

    if (!fecha) return res.status(400).json({ message: 'La fecha es requerida' });

    const estadosValidos = ['pendiente_pago', 'seña_abonada', 'confirmada', 'cancelada'];
    if (estado && !estadosValidos.includes(estado)) {
        return res.status(400).json({ message: 'Estado inválido' });
    }

    try {
        const salon = await Salon.findOne({ where: { dueno_id: req.persona!.id_persona } });
        if (!salon) return res.status(404).json({ message: 'No tenés un salón registrado' });

        // Verificar que no haya reserva activa en esa fecha
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

        const datos_evento = JSON.stringify({
            manual: true,
            nombre_organizador: nombre_organizador || 'Sin nombre',
            email_organizador: email_organizador || null,
            tipo_evento: tipo_evento || null,
            notas: notas || null,
        });

        const reserva = await Reserva.create({
            salon_id: salon.id_salon,
            fecha,
            persona_id: req.persona!.id_persona,
            evento_id: null as any,
            estado: estado || 'confirmada',
            datos_evento,
            monto_alquiler: Number(salon.precio_alquiler) || 0,
            fecha_limite_pago: null as any,
        });

        // Enviar notificación si corresponde
        if (enviar_notificacion && email_organizador) {
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

        return res.status(201).json({ message: 'Fecha bloqueada correctamente', reserva });
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
    const {id_salon} = req.params
    try {
        const salon = await Salon.findByPk(id_salon)
        if (!salon) return res.status(404).json({ message: 'Salón no encontrado' })
        const response = {
            ...salon.toJSON(),
            precio_publico: await calcularPrecioPublico(Number(salon.precio_alquiler), salon.dueno_id),
        }
        res.json({response})
    } catch (error) {
        logger.error('[Salon] Error', { error: String(error) })
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
        logger.error('[Salon] Error', { error: String(error) })
        return res.status(500).json({ message: 'Error al actualizar salón', error: error.message })
    }
}

export const deleteSalon: RequestHandler = async(req: Request, res: Response)=>{
    const {id_salon}= req.params
    try {
        const response = await Salon.destroy()
    } catch (error) {
        logger.error('[Salon] Error', { error: String(error) })
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
