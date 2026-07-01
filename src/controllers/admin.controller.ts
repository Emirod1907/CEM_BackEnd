import { Request, RequestHandler, Response } from 'express';
import Rol from '../models/rol';
import Permiso from '../models/permiso';
import RolPermiso from '../models/rolPermiso';

// GET /api/admin/roles  → todos los roles con sus permisos
export const getRoles: RequestHandler = async (req: Request, res: Response) => {
    try {
        const roles = await Rol.findAll({
            include: [{
                model: Permiso,
                as: 'Permisos',
                attributes: ['id_permiso', 'entidad', 'accion', 'descripcion'],
                through: { attributes: [] }
            }]
        });
        return res.json({ roles });
    } catch (error: any) {
        return res.status(500).json({ message: "Error al obtener roles", error: error.message });
    }
};

// GET /api/admin/permisos  → todos los permisos disponibles
export const getPermisos: RequestHandler = async (req: Request, res: Response) => {
    try {
        const permisos = await Permiso.findAll({
            order: [['entidad', 'ASC'], ['accion', 'ASC']]
        });
        return res.json({ permisos });
    } catch (error: any) {
        return res.status(500).json({ message: "Error al obtener permisos", error: error.message });
    }
};

// PUT /api/admin/roles/:id/permisos  → reemplaza los permisos del rol
export const updateRolPermisos: RequestHandler = async (req: Request, res: Response) => {
    const { id } = req.params;
    const { permiso_ids }: { permiso_ids: number[] } = req.body;

    try {
        const rol = await Rol.findByPk(id);
        if (!rol) {
            return res.status(404).json({ message: "Rol no encontrado" });
        }

        // Eliminar permisos actuales del rol
        await RolPermiso.destroy({ where: { rol_id: id } });

        // Asignar los nuevos permisos
        if (permiso_ids && permiso_ids.length > 0) {
            const nuevosPermisos = permiso_ids.map((permiso_id) => ({
                rol_id: Number(id),
                permiso_id
            }));
            await RolPermiso.bulkCreate(nuevosPermisos, { ignoreDuplicates: true });
        }

        // Retornar rol actualizado con sus permisos
        const rolActualizado = await Rol.findByPk(id, {
            include: [{
                model: Permiso,
                as: 'Permisos',
                attributes: ['id_permiso', 'entidad', 'accion', 'descripcion'],
                through: { attributes: [] }
            }]
        });

        return res.json({
            message: "Permisos actualizados correctamente",
            rol: rolActualizado
        });
    } catch (error: any) {
        return res.status(500).json({ message: "Error al actualizar permisos", error: error.message });
    }
};
