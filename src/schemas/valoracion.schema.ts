import { z } from 'zod';

export const crearValoracionesSchema = z.object({
    reserva_id: z.coerce.number().int().positive(),
    valoraciones: z.array(z.object({
        tipo: z.enum(['salon', 'servicio', 'evento_general']),
        entidad_id: z.number().int().positive().nullable().optional().default(null),
        estrellas: z.number().int().min(1).max(5),
        comentario: z.string().max(500).nullable().optional().default(null),
    })).min(1, 'Debés enviar al menos una valoración'),
});
