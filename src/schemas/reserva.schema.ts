import { z } from 'zod';

const servicioItemSchema = z.object({
    id_servicio: z.number({ error: 'id_servicio debe ser un número' }).int().positive(),
    nombre: z.string().min(1, 'El nombre del servicio no puede estar vacío'),
    descripcion: z.string().nullable().optional(),
    precio: z.number({ error: 'precio debe ser un número' }).nonnegative('El precio no puede ser negativo'),
    cantidad: z.number({ error: 'cantidad debe ser un número' }).int().positive('La cantidad debe ser mayor a 0'),
    categoria: z.string().nullable().optional(),
    tipo_precio: z.enum(['fijo', 'por_persona', 'por_hora', 'por_turno']).optional(),
    horas: z.number().positive().nullable().optional(),
    turnos: z.number().positive().nullable().optional(),
    imagen: z.string().nullable().optional(),
});

const datosEventoSchema = z.object({
    nombre: z.string().min(1, 'El nombre del evento no puede estar vacío'),
    descripcion: z.string().optional(),
    cupo: z.coerce.number().int().positive('El cupo debe ser mayor a 0').optional(),
    fecha: z.string().optional(),
    precio: z.coerce.number().nonnegative().optional(),
    imagen: z.string().nullable().optional(),
}).passthrough(); // permite campos extra que el controller ya maneja

export const solicitarReservaSchema = z.object({
    salon_id: z.coerce
        .number({ error: 'salon_id debe ser un número entero' })
        .int()
        .positive('salon_id debe ser un entero positivo'),
    fecha: z
        .string({ error: 'fecha es requerida' })
        .min(1, 'fecha no puede estar vacía'),
    datos_evento: datosEventoSchema,
});

export const actualizarServiciosSchema = z.object({
    servicios: z
        .array(servicioItemSchema)
        .default([]),
    numInvitados: z.coerce
        .number()
        .int()
        .positive()
        .nullable()
        .optional(),
});
