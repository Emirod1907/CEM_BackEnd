
import Persona from '../models/persona';
import { Request, Response, RequestHandler }from 'express';
import { generateToken } from '../libs/jwt'
import bcrypt from 'bcryptjs'

export const register = async(req:Request, res:Response)=>{
    
    if (!req.body || Object.keys(req.body).length === 0) {
            console.error("Request body is empty");
            return res.status(400).json({ message: "Request body is missing" });
        }
        
    console.log("Request body:", req.body);
    
    const {nombre, apellido, dni, fecha_nacimiento, email, nombre_usuario, user_password}= req.body;
    try{
        console.log("Request body:", req.body);
        const existingUser = await Persona.findOne({ where: { email } });
        if (existingUser) {
            return  res.status(400).json({ message: "El correo ya está registrado" });
        }
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(user_password, salt);
        const newPersona = await Persona.create({
            nombre,
            apellido,
            dni,
            fecha_nacimiento,
            email,
            nombre_usuario,
            user_password: hashedPassword,
        });
        console.log("Request body:", req.body);
        const token = await generateToken({ id_persona: newPersona.id_persona });

        res.cookie('token',token,{
            httpOnly: true,
            secure: process.env.NODE_ENV ==='production',
            sameSite: 'strict'
        }),
        res.json({
            msg:"Usuario creado con éxito",
            persona:{
                id_persona: newPersona.id_persona,
                nombre: newPersona.nombre,
                email: newPersona.email
            }
        });
        }
    catch(error){
        res.status(500).json({message:"error message",error});
    }
}
export const login: RequestHandler = async(req:Request, res:Response)=>{
    const {email, user_password}= req.body; 

    try{
        const persona = await Persona.findOne({ where: {email}})
        if(!persona){
            res.status(400).json({message:"No se encontró el usuario"})
            return;
        }
        else{
            console.log("Email buscado:", email);
            console.log("Usuario encontrado:", persona ? persona.email : "Ninguno");
            const validPassword = await bcrypt.compare(user_password, persona.user_password);
            console.log("Contraseña recibida:", user_password);
            console.log("Hash almacenado:", persona?.user_password);
            if(!validPassword){
                res.status(400).json({message:"Contraseña incorrecta"})
                return;
            }
            const token = await generateToken({id_persona: persona.id_persona})
            res.cookie('token',token, {
                httpOnly: true,
                secure: process.env.NODE_ENV==='production',
                sameSite: 'strict'
            })
            res.json({message:"Sesion iniciada con exito",
                id_persona: persona.id_persona,
                user: persona.nombre,
                email: persona.email,
            })
        }
        
    }
    catch(error: any){
        res.status(500).json({
            message:"Error en el servidor",error
        });
    }
}
export const logout: RequestHandler = async( req:Request, res: Response)=>{
    res.clearCookie('token');
    res.json({msg:"Sesion cerrada con Exito!"})
}
