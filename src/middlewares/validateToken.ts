import { NextFunction, Request, Response } from "express";
import { verifyToken } from '../libs/jwt';
import { JwtPayload } from '../libs/jwt';

const authRequired = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { token } = req.cookies;

    if (!token) {
      return res.status(401).json({ message: "Unauthorized - No token provided" });
    }

    const decoded = await verifyToken(token);
    req.persona = decoded;
    next();
  } catch (error: any) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: "Token expired" });
    }
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ message: "Invalid token" });
    }
    return res.status(500).json({ message: "Internal server error" });
  }
};
export default authRequired;

// Autenticación opcional: si hay cookie de sesión válida, popula req.persona;
// si no hay o es inválida, continúa igual (sin 401). Útil para endpoints públicos
// que ajustan su respuesta según el usuario logueado (ej: términos con su comisión).
export const authOptional = async (
  req: Request,
  _res: Response,
  next: NextFunction
) => {
  try {
    const { token } = req.cookies;
    if (token) {
      const decoded = await verifyToken(token);
      req.persona = decoded;
    }
  } catch { /* token inválido/expirado → seguir sin persona */ }
  next();
};