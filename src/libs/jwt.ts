import jwt from 'jsonwebtoken';

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
    