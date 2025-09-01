import { Request, RequestHandler, Response } from "express";
import Evento from "../models/evento";
import Reserva from "../models/reserva"

export const crearEvento: RequestHandler = async (req: Request, res: Response)=>{
    const { bodega_id, fecha, ...eventoData}= req.body;
    try {
        const reservaExistente = await Reserva.findOne({where:{bodega_id, fecha}})
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

export const updateEvento: RequestHandler = async (req: Request, res: Response)=>{    

}

export const deleteEvento: RequestHandler = async (req: Request, res: Response)=>{
    
}