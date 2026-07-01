import { Request, Response, NextFunction } from 'express';
import { AppError } from '../libs/errors';
import { logger } from '../libs/logger';

const isDev = process.env.NODE_ENV !== 'production';

/**
 * Middleware global de manejo de errores.
 * Debe registrarse DESPUÉS de todas las rutas en server.ts.
 *
 * Formato de respuesta unificado:
 *   { status: number, message: string }
 *   En desarrollo agrega: stack
 */
export const errorHandler = (
    err: any,
    _req: Request,
    res: Response,
    _next: NextFunction
): void => {

    // --- 1. Errores operacionales propios (AppError y subclases) ---
    if (err instanceof AppError) {
        if (isDev) {
            res.status(err.statusCode).json({
                status: err.statusCode,
                message: err.message,
                stack: err.stack,
            });
            return;
        }
        res.status(err.statusCode).json({
            status: err.statusCode,
            message: err.message,
        });
        return;
    }

    // --- 2. Errores de Sequelize ---
    if (err.name === 'SequelizeUniqueConstraintError') {
        res.status(409).json({ status: 409, message: 'Ya existe un registro con esos datos' });
        return;
    }
    if (err.name === 'SequelizeValidationError') {
        const message = (err.errors as any[])?.map((e: any) => e.message).join(', ')
            ?? 'Error de validación en base de datos';
        res.status(400).json({ status: 400, message });
        return;
    }
    if (err.name === 'SequelizeForeignKeyConstraintError') {
        res.status(400).json({ status: 400, message: 'El recurso relacionado no existe' });
        return;
    }

    // --- 3. Errores JWT (cuando algún middleware llama next(err)) ---
    if (err.name === 'TokenExpiredError') {
        res.status(401).json({ status: 401, message: 'Token expirado' });
        return;
    }
    if (err.name === 'JsonWebTokenError') {
        res.status(401).json({ status: 401, message: 'Token inválido' });
        return;
    }

    // --- 4. Error no operacional (bug real) ---
    // Siempre logueamos, pero en producción no exponemos detalles al cliente
    logger.error('Unhandled server error', {
        message: err.message,
        stack: err.stack,
        name: err.name,
    });

    if (isDev) {
        res.status(500).json({
            status: 500,
            message: err.message ?? 'Error interno del servidor',
            stack: err.stack,
        });
        return;
    }

    res.status(500).json({
        status: 500,
        message: 'Error interno del servidor',
    });
};
