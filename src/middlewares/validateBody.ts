import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';

export const validateBody = (schema: ZodSchema) =>
    (req: Request, res: Response, next: NextFunction): void => {
        const result = schema.safeParse(req.body);
        if (!result.success) {
            res.status(400).json({
                message: 'Datos inválidos',
                errors: result.error.flatten().fieldErrors,
            });
            return;
        }
        req.body = result.data;
        next();
    };
