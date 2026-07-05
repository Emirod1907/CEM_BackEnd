import { Request, RequestHandler, Response } from "express";
import Evento from "../models/evento";
import Reserva from "../models/reserva"
import Salon from "../models/salon";
import { logger } from "../libs/logger";
import { canManageOwnedResource } from "../services/authz.service";

export const crearEvento: RequestHandler = async (req: Request, res: Response)=>{
    const { salon_id, fecha, ...eventoData}= req.body;
    logger.debug('[Evento] crearEvento', { fecha: req.body.fecha, tipoFecha: typeof req.body.fecha });

    if (!salon_id || !fecha) {
        return res.status(400).json({ message: 'salon_id y fecha son requeridos' });
    }

    try {
        const salon = await Salon.findByPk(salon_id);
        if (!salon) {
            return res.status(404).json({ message: 'Salón no encontrado' });
        }

        const reservaExistente = await Reserva.findOne({
            where:{
                salon_id,
                fecha,
            }
        });
        if(reservaExistente){
            return res.status(400).json({message: "Salón no disponible"});
        }

        const newEvento = await Evento.create({
            ...eventoData,
            fecha: new Date(fecha),
            salon_id,
            creado_por: req.persona!.id_persona
        });

        await Reserva.create({
            evento_id: newEvento.id_evento,
            salon_id,
            fecha,
            persona_id: req.persona!.id_persona,
        });

        return res.status(201).json({
            msg:"Evento creado satisfactoriamente con su reserva",
            evento:{
                id_evento: newEvento.id_evento,
                nombre: newEvento.nombre,
                descripcion: newEvento.descripcion,
                fecha: newEvento.fecha
            }
        });
    } catch (error: any) {
        logger.error('[Evento] Error al crear evento', { error: error.message })
        return res.status(500).json({ message: 'Error al crear evento', error: error.message })
    }
}

export const getEventos: RequestHandler = async (_req: Request, res: Response)=>{
    try{
        const response = await Evento.findAll({
            where: { estado: 'activo', es_publico: true }
        })
        return res.json({response})
    }catch(error: any){
        logger.error('[Evento] Error al obtener eventos', { error: error.message })
        return res.status(500).json({ message: 'Error al obtener eventos', error: error.message })
    }
}

export const getEvento: RequestHandler = async (req: Request, res: Response)=>{
    const { id } = req.params
    try{
        const response = await Evento.findByPk(id)
        if (!response) return res.status(404).json({ message: 'Evento no encontrado' })
        return res.json({response})
    }catch(error: any){
        logger.error('[Evento] Error al obtener evento', { error: error.message })
        return res.status(500).json({ message: 'Error al obtener evento', error: error.message })
    }
}

export const updateEvento: RequestHandler = async (req: Request, res: Response)=>{
    const { id } = req.params
    const camposPermitidos = ['nombre', 'descripcion', 'fecha', 'precio', 'imagen', 'cupo', 'estado', 'es_publico']
    try{
        const evento = await Evento.findByPk(id)
        if (!evento) return res.status(404).json({ message: 'Evento no encontrado' })

        const autorizado = await canManageOwnedResource(req.persona?.id_persona, evento.creado_por)
        if (!autorizado) {
            return res.status(403).json({ message: 'No tenés permiso para modificar este evento' })
        }

        const updateData = camposPermitidos.reduce((acc, campo) => {
            if (req.body[campo] !== undefined) acc[campo] = campo === 'fecha' ? new Date(req.body[campo]) : req.body[campo]
            return acc
        }, {} as Record<string, any>)

        await evento.update(updateData)
        return res.json({ message: 'Evento actualizado correctamente', evento })
    }catch(error: any){
        logger.error('[Evento] Error al actualizar evento', { error: error.message })
        return res.status(500).json({ message: 'Error al actualizar evento', error: error.message })
    }
}

export const deleteEvento: RequestHandler = async (req: Request, res: Response)=>{
    const { id } = req.params
    try {
        const evento = await Evento.findByPk(id)
        if (!evento) return res.status(404).json({ message: 'Evento no encontrado' })

        const autorizado = await canManageOwnedResource(req.persona?.id_persona, evento.creado_por)
        if (!autorizado) {
            return res.status(403).json({ message: 'No tenés permiso para eliminar este evento' })
        }

        await evento.update({ estado: 'cancelado' })
        await Reserva.update(
            { estado: 'cancelada' },
            { where: { evento_id: evento.id_evento } }
        )

        return res.json({ message: 'Evento cancelado correctamente' })
    } catch (error: any) {
        logger.error('[Evento] Error al eliminar evento', { error: error.message })
        return res.status(500).json({ message: 'Error al eliminar evento', error: error.message })
    }
}
