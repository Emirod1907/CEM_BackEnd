import { Router } from "express";
import type { RequestHandler } from "express";
import { deletePersona, getPersona, getPersonas, postPersona, putPersona } from "../controllers/persona.controller";
import { register , login, logout, verify } from '../controllers/auth.controller';

const router = Router()

router.post('/debug', (req, res) => {
  console.log("Headers recibidos:", req.headers);
  console.log("Cuerpo parseado:", req.body);
  console.log("Cuerpo en bruto:", (req as any).rawBody);
  
  res.json({
    headers: req.headers,
    parsedBody: req.body,
    rawBody: (req as any).rawBody
  });
});

router.post('/register', (req, res) => {
  console.log("Register body:", req.body);
  register(req, res);
});
router.post('/login', login);
router.post('/logout', logout );

router.get('/verify', verify )



export default router;