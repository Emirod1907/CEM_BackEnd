import { Request, RequestHandler, Response } from "express";
import Bodega from "../models/bodega";

export const crearBodega: RequestHandler = async(req: Request, res: Response)=>{
    
    console.log('🔍 === INICIO crearBodega ===');
    console.log('📨 Método:', req.method);
    console.log('🔗 URL:', req.url);
    console.log('🍪 Cookies:', req.cookies);
    console.log('📦 Body recibido:', req.body);

    const {nombre, domicilio, descripcion, imagen, aforo}= req.body
    console.log('Datos recibidos:', req.body);

    try {
        if (!nombre || !domicilio || !aforo) {
            return res.status(400).json({message: "Nombre, domicilio y aforo son requeridos"});
        }
        const existingBodega = await Bodega.findOne({where: {nombre}});
        if(existingBodega){
            return res.status(400).json({message: "La Bodega ya existe"});
        }

        const newBodega = await Bodega.create({
            nombre,
            domicilio,
            descripcion: descripcion||'',
            imagen: imagen||'',
            aforo: parseInt(aforo)
        });
        res.json({
            msg: "Bodega creada con éxito",
            bodega:{
                id_bodega: newBodega.id_bodega,
                nombre: newBodega.nombre,
                domicilio: newBodega.domicilio
            }
        })
    } catch (error: any) {
        console.error('❌ Error al crear bodega:', error);
        res.status(500).json({
            message:"error interno del servidor",
            error: error.message
        })
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