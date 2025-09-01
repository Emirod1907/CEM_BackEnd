import { Request, Response } from "express";
import Persona from '../models/persona'


export const getPersonas = async (req: Request, res: Response)=>{
    
    
    try {
        const personas = await Persona.findAll();
        res.json({personas})    
    } catch (error) {
        res.status(500).json({ message: "Error al obtener las personas", error })
    }
}
export const getPersona = async (req: Request, res: Response)=>{
    
    const {id}=req.params;

    const persona = await Persona.findByPk(id)

    if(persona){
        res.json({
            persona,
            id
    })
    }else{
        res.status(404).json({
            msg: `no se encontro el usuario con id ${id}`
        })
    }

}
export const postPersona = (req: Request, res: Response)=>{
    const {body}= req;
    
    res.json({
        msg:"post persona",
        body
    })
}
export const putPersona = (req: Request, res: Response)=>{
    const {id} = req.params;
    const {body} = req;
    
    res.json({
        msg:"put Persona",
        id,
        body
    })
}
export const deletePersona = (req: Request, res: Response)=>{
    const {id} = req.params;

    res.json({
        msg:"Eliminar usuario",
        id
    })
}