import Persona from '../models/persona';
import Rol from '../models/rol';
import { EMAILS_PERMITIDOS } from '../config/emailsPermitidos';

export type AuthzContext = {
    persona_id: number;
    email: string | null;
    rol: string | null;
    isAdmin: boolean;
    isFullAccess: boolean;
};

export async function getAuthzContext(persona_id?: number | null): Promise<AuthzContext | null> {
    if (!persona_id) return null;

    const persona = await Persona.findByPk(persona_id, {
        include: [{ model: Rol, as: 'Rol', attributes: ['nombre'] }],
        attributes: ['id_persona', 'email']
    });

    if (!persona) return null;

    const email = (persona as any).email || null;
    const rol = (persona as any).Rol?.nombre || null;
    const isFullAccess = Boolean(email && EMAILS_PERMITIDOS.includes(email));
    const isAdmin = rol === 'admin' || isFullAccess;

    return {
        persona_id: (persona as any).id_persona,
        email,
        rol,
        isAdmin,
        isFullAccess,
    };
}

export async function isAdminUser(persona_id?: number | null): Promise<boolean> {
    const ctx = await getAuthzContext(persona_id);
    return Boolean(ctx?.isAdmin);
}

export async function canManageOwnedResource(
    persona_id: number | undefined | null,
    owner_id: number | undefined | null,
): Promise<boolean> {
    if (!persona_id || owner_id === undefined || owner_id === null) return false;
    if (Number(persona_id) === Number(owner_id)) return true;
    return isAdminUser(persona_id);
}
