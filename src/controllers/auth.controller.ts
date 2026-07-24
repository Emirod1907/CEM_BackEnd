
import Persona from '../models/persona';
import Rol from '../models/rol';
import { Request, Response, RequestHandler }from 'express';
import { generateToken, verifyToken } from '../libs/jwt'
import * as bcrypt from 'bcryptjs'
import { Op } from 'sequelize'
import { logger } from '../libs/logger'
import { EMAILS_PERMITIDOS } from '../config/emailsPermitidos'

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

// Cookie de sesión. Si el frontend está en otro dominio por HTTPS (producción:
// Netlify/Vercel + backend en Railway), el navegador solo envía la cookie
// cross-site si es SameSite=None + Secure. En local (http) se usa Lax.
const crossSite = FRONTEND_URL.startsWith('https://');
const COOKIE_OPTS = {
    httpOnly: true as const,
    secure: crossSite,
    sameSite: (crossSite ? 'none' : 'lax') as 'none' | 'lax',
    maxAge: 24 * 60 * 60 * 1000,
};

export const register = async(req:Request, res:Response)=>{
    
    if (!req.body || Object.keys(req.body).length === 0) {
            logger.warn('[Auth] register: request body vacío');
            return res.status(400).json({ message: "Request body is missing" });
        }

    const {nombre, apellido, dni, cuit, celular, fecha_nacimiento, email, nombre_usuario, user_password}= req.body;
    try{
        const existingUser = await Persona.findOne({ where: { email } });
        if (existingUser) {
            return  res.status(400).json({ message: "El correo ya está registrado" });
        }

        try {
            const fechaNacimientoDate = fecha_nacimiento ? new Date(fecha_nacimiento) : undefined;
            const newPersona = await Persona.create({
            nombre,
            apellido,
            dni,
            cuit,
            celular,
            fecha_nacimiento: fechaNacimientoDate,
            email,
            nombre_usuario,
            user_password: user_password,
        });
                const token = await generateToken({ id_persona: newPersona.id_persona });

        res.cookie('token', token, COOKIE_OPTS),
        res.json({
            msg:"Usuario creado con éxito",
            persona:{
                id_persona: newPersona.id_persona,
                nombre: newPersona.nombre,
                email: newPersona.email
            }
        });
    } catch (error: any) {
            logger.error('[Auth] Error al crear persona', { error: error.message });
            return res.status(500).json({ error: error.message });
        }
    }
    catch(error){
        res.status(500).json({message:"error message",error});
    }
}
export const login: RequestHandler = async(req:Request, res:Response)=>{
    const {email, user_password}= req.body; 

    try{
        const persona = await Persona.findOne({
            where: { [Op.or]: [{ email }, { nombre_usuario: email }] },
            include: [{ model: Rol, as: 'Rol', attributes: ['nombre'] }]
        });
        if(!persona){
            return res.status(400).json({message:"No se encontró el usuario"});
        }

        logger.debug('[Auth] login: verificando credenciales', { email });
        const validPassword = await bcrypt.compare(user_password, persona.user_password);
        if(!validPassword){
            res.status(400).json({message:"Contraseña incorrecta"})
            return;
        }
        const token = await generateToken({id_persona: persona.id_persona})
        res.cookie('token', token, COOKIE_OPTS)
        return res.status(200).json({message:"Sesion iniciada con exito",
            id_persona: persona.id_persona,
            user: persona.nombre,
            email: persona.email,
            rol: (persona as any).Rol?.nombre || null,
            perfil_completado: persona.perfil_completado,
            categoria_servicio: persona.categoria_servicio || null
        })
        
    }
    catch(error: any){
        res.status(500).json({
            message:"Error en el servidor",error
        });
    }
}
export const logout: RequestHandler = async( req:Request, res: Response)=>{
    res.clearCookie('token', { httpOnly: true, secure: crossSite, sameSite: (crossSite ? 'none' : 'lax') as 'none' | 'lax' });
    res.json({msg:"Sesion cerrada con Exito!"})
}

export const googleCallback: RequestHandler = async (req: Request, res: Response) => {
    try {
        const persona = req.user as any;
        if (!persona) {
            return res.redirect(`${FRONTEND_URL}/login?error=acceso_no_autorizado`);
        }
        const token = await generateToken({ id_persona: persona.id_persona });
        res.cookie('token', token, COOKIE_OPTS);
        return res.redirect(`${FRONTEND_URL}/auth/google/callback`);
    } catch (error) {
        return res.redirect(`${FRONTEND_URL}/login?error=google_auth_failed`);
    }
};

export const verify = async ( req: Request, res: Response)=>{
    const {token} = req.cookies

    if(!token) return res.status(401).json({message: "Unauthorized"});
    try {
        const decoded = await verifyToken(token);
        const personaFound = await Persona.findByPk(decoded.id_persona, {
            include: [{ model: Rol, as: 'Rol', attributes: ['nombre'] }]
        });

        if(!personaFound) return res.status(401).json({message:"User not found"})

        return res.json({
                id_persona: personaFound.id_persona,
                user: personaFound.nombre,
                nombre: personaFound.nombre,
                apellido: personaFound.apellido,
                email: personaFound.email,
                rol: (personaFound as any).Rol?.nombre || null,
                perfil_completado: personaFound.perfil_completado,
                categoria_servicio: personaFound.categoria_servicio || null,
                cuit: personaFound.cuit || null,
                celular: personaFound.celular || null,
                fecha_nacimiento: personaFound.fecha_nacimiento || null
        })
    }catch (error) {
        return res.status(401).json({ message: "Invalid or expired token" });
    }}

// Roles válidos que el usuario puede seleccionar
const ROLES_PERMITIDOS = ['entusiasta', 'organizador', 'dueno_salon', 'proveedor_servicios', 'proveedor_insumos'];

export const selectRole: RequestHandler = async (req: Request, res: Response) => {
    try {
        const { rol } = req.body;

        if (!rol || !ROLES_PERMITIDOS.includes(rol)) {
            return res.status(400).json({ message: 'Rol inválido' });
        }

        const rolFound = await Rol.findOne({ where: { nombre: rol } });
        if (!rolFound) return res.status(404).json({ message: 'Rol no encontrado en la base de datos' });

        const persona = await Persona.findByPk(req.persona!.id_persona);
        if (!persona) return res.status(404).json({ message: 'Usuario no encontrado' });

        // El rol se elige una sola vez: si la persona ya tiene rol asignado,
        // solo las cuentas full access (testing/admin) pueden cambiarlo.
        // Ocultar el botón en el frontend no alcanza: esta es la barrera real.
        const esFullAccess = persona.email && EMAILS_PERMITIDOS.includes(persona.email);
        if ((persona as any).rol_id && !esFullAccess) {
            return res.status(403).json({ message: 'Tu rol ya fue asignado y no puede modificarse' });
        }

        await persona.update({ rol_id: (rolFound as any).id_rol });

        return res.json({
            message: 'Rol asignado correctamente',
            rol: rolFound.nombre,
            perfil_completado: persona.perfil_completado
        });
    } catch (error) {
        return res.status(500).json({ message: 'Error al asignar rol', error });
    }
};

export const completeProfile: RequestHandler = async (req: Request, res: Response) => {
    try {
        const { categoria_servicio } = req.body;

        const persona = await Persona.findByPk(req.persona!.id_persona);
        if (!persona) return res.status(404).json({ message: 'Usuario no encontrado' });

        const updateData: any = { perfil_completado: true };
        if (categoria_servicio) {
            updateData.categoria_servicio = typeof categoria_servicio === 'string'
                ? categoria_servicio
                : JSON.stringify(categoria_servicio);
        }

        await persona.update(updateData);

        return res.json({ message: 'Perfil completado correctamente', perfil_completado: true });
    } catch (error) {
        return res.status(500).json({ message: 'Error al completar perfil', error });
    }
};

// Completar datos tras el login con Google: CUIT, celular y fecha de nacimiento.
// El nombre, apellido y email ya vienen de Google. La fecha de nacimiento habilita
// el cupón de descuento de cumpleaños (job diario cuponCumpleanos).
export const completeRegistration: RequestHandler = async (req: Request, res: Response) => {
    try {
        const { cuit, celular, fecha_nacimiento } = req.body;

        const persona = await Persona.findByPk(req.persona!.id_persona);
        if (!persona) return res.status(404).json({ message: 'Usuario no encontrado' });

        const updateData: any = {};
        if (cuit) updateData.cuit = cuit;
        if (celular) updateData.celular = celular;
        if (fecha_nacimiento) updateData.fecha_nacimiento = new Date(fecha_nacimiento);

        await persona.update(updateData);

        return res.json({
            message: 'Datos completados correctamente',
            cuit: persona.cuit,
            celular: persona.celular,
        });
    } catch (error: any) {
        return res.status(500).json({ message: 'Error al completar datos', error: error?.message || error });
    }
};
