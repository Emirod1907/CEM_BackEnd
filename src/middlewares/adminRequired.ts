import { NextFunction, Request, Response } from 'express';
import Persona from '../models/persona';
import Rol from '../models/rol';

// Emails con acceso total sin importar el rol activo (para testeo con múltiples perfiles)
const EMAILS_FULL_ACCESS = ['emi.electro2012@gmail.com', 'emi.rodri1907guez@gmail.com'];

const adminRequired = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const id_persona = req.persona?.id_persona;
        if (!id_persona) {
            return res.status(401).json({ message: "No autorizado" });
        }

        const persona = await Persona.findByPk(id_persona, {
            include: [{ model: Rol, as: 'Rol', attributes: ['nombre'] }]
        });

        const rolNombre = (persona as any)?.Rol?.nombre;
        const esAdmin     = rolNombre === 'admin';
        const esFullAccess = persona?.email && EMAILS_FULL_ACCESS.includes(persona.email);

        if (!persona || (!esAdmin && !esFullAccess)) {
            return res.status(403).json({ message: "Acceso denegado - se requiere rol de administrador" });
        }

        next();
    } catch (error) {
        return res.status(500).json({ message: "Error interno del servidor" });
    }
};

export default adminRequired;
