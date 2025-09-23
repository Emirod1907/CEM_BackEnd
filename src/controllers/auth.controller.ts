
import Persona from '../models/persona';
import { Request, Response, RequestHandler }from 'express';
import { generateToken } from '../libs/jwt'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'

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
        // const salt = await bcrypt.genSalt(10);
        // const hashedPassword = await bcrypt.hash(user_password, salt);
        const newPersona = await Persona.create({
            nombre,
            apellido,
            dni,
            fecha_nacimiento,
            email,
            nombre_usuario,
            user_password: user_password,
        });
        console.log("Request body:", req.body);
        const token = await generateToken({ id_persona: newPersona.id_persona });

        res.cookie('token',token,{
            httpOnly: true,
            secure: process.env.NODE_ENV ==='production',
            sameSite: 'none'
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
            return res.status(400).json({message:"No se encontró el usuario"});
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
            return res.status(200).json({message:"Sesion iniciada con exito",
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

export const verify = async ( req: Request, res: Response)=>{
    const {token} = req.cookies

    if(!token) return res.status(401).json({message: "Unauthorized"});
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET!)as any;
        const personaFound = await Persona.findByPk(decoded.id_persona)

        if(!personaFound) return res.status(401).json({message:"User not found"})
        
        return res.json({
                id_persona: personaFound.id_persona,
                user: personaFound.nombre,
                email: personaFound.email,
        })
    }catch (error) {
        return res.status(401).json({ message: "Invalid or expired token" });
    }}
