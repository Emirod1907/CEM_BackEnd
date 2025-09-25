import { Request, RequestHandler, Response } from "express";
import Evento from "../models/evento";
import Reserva from "../models/reserva"

export const crearEvento: RequestHandler = async (req: Request, res: Response)=>{
    const { bodega_id, fecha, ...eventoData}= req.body;
    console.log('🔍 Fecha recibida:', req.body.fecha);
    console.log('🔍 Tipo de fecha:', typeof req.body.fecha);
    eventoData.fecha = new Date(fecha);
    try {
        const reservaExistente = await Reserva.findOne(
            {where:{
                bodega_id: bodega_id, 
                fecha: fecha
            }})
        if(reservaExistente){
            res.status(400).json({message: "Bodega no disponible"})
        }
        const newEvento = await Evento.create(eventoData);
        await Reserva.create({
            evento_id: newEvento.id_evento,
            bodega_id,
            fecha,
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
        console.error(error)
    }
}

export const getEventos: RequestHandler = async (req: Request, res: Response)=>{
    try{
        const response = await Evento.findAll()
        res.json({response})
    }catch(error){
        console.error(error)
    }
}

export const getEvento: RequestHandler = async (req: Request, res: Response)=>{
    const {id_evento} = req.params
    try{
        const response = await Evento.findByPk(id_evento)
        res.json({response})
    }catch(error){
        console.error(error)
    }
}

export const updateEvento: RequestHandler = async (req: Request, res: Response)=>{    
    const {id_evento} = req.params
    const {body} = req.body
    try{
        const response = await Evento.update
    }catch(error){
        console.error(error)
    }
}

export const deleteEvento: RequestHandler = async (req: Request, res: Response)=>{
    const { id_evento}= req.params
    try {
        const response = await Evento.destroy()
    } catch (error) {
        console.error(error)
    }
}