import jwt from 'jsonwebtoken';

export interface JwtPayload {
  id_persona: number;
}

if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET no está definido en las variables de entorno. El servidor no puede arrancar sin esta variable.');
}
// La aserción ! es segura: la línea anterior lanza si JWT_SECRET no existe.
const JWT_SECRET = process.env.JWT_SECRET!;

export function generateToken(payload: object): Promise<string> {
    return new Promise((resolve, reject) => {
        jwt.sign(
            payload,
            JWT_SECRET,
            { expiresIn: "30m" },
            (err: Error | null, token: string | undefined) => {
                if (err) { return reject(err); }
                if (!token) { return reject(new Error("Token generation failed")); }
                resolve(token);
            }
        );
    });
}

export function verifyToken(token: string): Promise<JwtPayload> {
  return new Promise((resolve, reject) => {
    jwt.verify(
      token,
      JWT_SECRET,
      (err: jwt.VerifyErrors | null, decoded: any) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(decoded as JwtPayload);
      }
    );
  });
}

