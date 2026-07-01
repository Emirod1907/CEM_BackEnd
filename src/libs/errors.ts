/**
 * Clase base para errores operacionales de la aplicación.
 * isOperational = true  → error esperado (input inválido, no encontrado, etc.)
 * isOperational = false → bug real, no debería ocurrir en flujo normal
 */
export class AppError extends Error {
    readonly statusCode: number;
    readonly isOperational: boolean;

    constructor(message: string, statusCode: number, isOperational = true) {
        super(message);
        this.statusCode = statusCode;
        this.isOperational = isOperational;
        // Restaura la cadena de prototipos correcta para instanceof
        Object.setPrototypeOf(this, new.target.prototype);
        Error.captureStackTrace(this, this.constructor);
    }
}

/** 400 — Datos del request inválidos o incompletos */
export class ValidationError extends AppError {
    constructor(message = 'Datos inválidos') {
        super(message, 400);
    }
}

/** 401 — Usuario no autenticado o token inválido */
export class AuthError extends AppError {
    constructor(message = 'No autenticado') {
        super(message, 401);
    }
}

/** 403 — Usuario autenticado pero sin permisos */
export class ForbiddenError extends AppError {
    constructor(message = 'Acceso denegado') {
        super(message, 403);
    }
}

/** 404 — Recurso no encontrado */
export class NotFoundError extends AppError {
    constructor(message = 'Recurso no encontrado') {
        super(message, 404);
    }
}

/** 409 — Conflicto con el estado actual (duplicado, reserva ocupada, etc.) */
export class ConflictError extends AppError {
    constructor(message = 'Conflicto con el estado actual del recurso') {
        super(message, 409);
    }
}
