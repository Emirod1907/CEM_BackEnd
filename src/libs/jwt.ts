import jwt from 'jsonwebtoken';

export interface JwtPayload {
  id_persona: number;
}

export function generateToken(payload: object): Promise<string>{
    return   new Promise((resolve, reject)=>{
                jwt.sign(
                    payload, 
                    'secret123',
                    { expiresIn: "15m" },
                    (err: Error|null , token: string| undefined)=>{
                        if(err){ return reject(err);};
                        if(!token){ return reject(new Error("Token generation failed"));}
                        resolve(token)
                        }
                    );
                }
            )
}

export function verifyToken(token: string): Promise<JwtPayload> {
  return new Promise((resolve, reject) => {
    jwt.verify(
      token,
      process.env.JWT_SECRET || 'secret123',
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

