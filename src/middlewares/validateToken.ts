import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
export const authRequired = ( req: Request, res: Response, next: NextFunction)=>{
    const {token} = req.cookies
    
    if (!token) return res.status(401).json({message: "Unauthorized"});

    jwt.verify(token, 'secret123', (err, persona)=>{

        req.persona = persona;

        next();

    })



}