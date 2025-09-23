import { Request, RequestHandler, Response } from "express";
import Bodega from "../models/bodega";

export const crearBodega: RequestHandler = async(req: Request, res: Response)=>{
    const {nombre, domicilio, descripcion, imagen, aforo}= req.body
    try {
        const existingBodega = await Bodega.findOne({where: {nombre}});
        if(existingBodega){
            res.status(400).json({message: "La Bodega ya existe"})
        }

        const newBodega = await Bodega.create({
            nombre,
            domicilio,
            descripcion,
            imagen,
            aforo
        });
        res.json({
            msg: "Bodega creada con éxito",
            bodega:{
                id_bodega: newBodega.id_bodega,
                nombre: newBodega.nombre,
                domicilio: newBodega.domicilio
            }
        })
    } catch (error) {
        res.status(500).json({message:"error message",error})
    }
}

export const getBodegas: RequestHandler = async(req: Request, res: Response)=>{
    try {
        const response = await Bodega.findAll()
        res.json({response})
    } catch (error) {
        console.error(error)
    }
}

export const getBodega: RequestHandler = async(req: Request, res: Response)=>{
    const {id_bodega} = req.params
    try {
        const response = await Bodega.findByPk(id_bodega)
        res.json({response})
    } catch (error) {
        console.error(error)
    }
}


export const updateBodega: RequestHandler = async(req: Request, res: Response)=>{
    const {id_bodega} = req.params
    const { body } = req.body
    try {
        const response = await Bodega.update
    } catch (error) {
        console.error(error)    
    }
}

export const deleteBodega: RequestHandler = async(req: Request, res: Response)=>{
    const {id_bodega}= req.params
    try {
        const response = await Bodega.destroy()
    } catch (error) {
        console.error(error)
    }
}