import { Request, RequestHandler, Response } from "express";
import { Op } from "sequelize";
import Evento from "../models/evento";
import Reserva from "../models/reserva"
import { logger } from "../libs/logger";

export const crearEvento: RequestHandler = async (req: Request, res: Response)=>{
    const { salon_id, fecha, ...eventoData}= req.body;
    logger.debug('[Evento] crearEvento', { fecha: req.body.fecha, tipoFecha: typeof req.body.fecha });
    eventoData.fecha = new Date(fecha);
    try {
        const reservaExistente = await Reserva.findOne(
            {where:{
                salon_id: salon_id, 
                fecha: fecha
            }})
        if(reservaExistente){
            return res.status(400).json({message: "Salón no disponible"})
        }
        const newEvento = await Evento.create({ ...eventoData, salon_id, creado_por: req.persona!.id_persona });
        await Reserva.create({
            evento_id: newEvento.id_evento,
            salon_id,
            fecha,
            persona_id: req.persona!.id_persona,
        })
        res.json({
            msg:"Evento creado satisfactoriamente con su reserva",
            evento:{
                nombre: newEvento.nombre,
                descripcion: newEvento.descripcion,
                fecha: newEvento.fecha
            }
        })
    } catch (error) {
        logger.error('[Evento] Error', { error: String(error) })
    }
}

export const getEventos: RequestHandler = async (req: Request, res: Response)=>{
    try{
        const response = await Evento.findAll({
            where: { estado: 'activo', es_publico: true }
        })
        res.json({response})
    }catch(error){
        logger.error('[Evento] Error', { error: String(error) })
        res.status(500).json({ message: 'Error al obtener eventos', error: String(error) })
    }
}

export const getEvento: RequestHandler = async (req: Request, res: Response)=>{
    const {id_evento} = req.params
    try{
        const response = await Evento.findByPk(id_evento)
        res.json({response})
    }catch(error){
        logger.error('[Evento] Error', { error: String(error) })
    }
}

export const updateEvento: RequestHandler = async (req: Request, res: Response)=>{    
    const {id_evento} = req.params
    const {body} = req.body
    try{
        const response = await Evento.update
    }catch(error){
        logger.error('[Evento] Error', { error: String(error) })
    }
}

export const deleteEvento: RequestHandler = async (req: Request, res: Response)=>{
    const { id_evento}= req.params
    try {
        const response = await Evento.destroy()
    } catch (error) {
        logger.error('[Evento] Error', { error: String(error) })
    }
}