import { NextFunction, Request, Response } from 'express';
import Persona from '../models/persona';
import Rol from '../models/rol';
import Permiso from '../models/permiso';
import '../models/rolPermiso'; // asegura que las asociaciones estén registradas

const checkPermiso = (entidad: string, accion: string) => {
    return async (req: Request, res: Response, next: NextFunction) => {
        try {
            const id_persona = req.persona?.id_persona;
            if (!id_persona) {
                return res.status(401).json({ message: "No autorizado" });
            }

            const persona = await Persona.findByPk(id_persona, {
                include: [{
                    model: Rol,
                    as: 'Rol',
                    include: [{
                        model: Permiso,
                        as: 'Permisos',
                        where: { entidad, accion },
                        required: false
                    }]
                }]
            });

            const rol = (persona as any)?.Rol;
            const tienePermiso = rol?.Permisos?.length > 0;

            if (!tienePermiso) {
                return res.status(403).json({
                    message: `Sin permiso para ${accion} en ${entidad}`
                });
            }

            next();
        } catch (error) {
            return res.status(500).json({ message: "Error interno del servidor" });
        }
    };
};

export default checkPermiso;
