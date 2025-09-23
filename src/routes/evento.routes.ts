import { Router } from "express";
import authRequired from "../middlewares/validateToken";
import { crearEvento, deleteEvento, getEvento, getEventos, updateEvento } from "../controllers/evento.controller";

const router = Router()

router.get('/eventos', getEventos)
router.get('/eventos/:id', getEvento)
router.post('/evento/new', authRequired, crearEvento)
router.put('/:id', authRequired, updateEvento)
router.delete('/:id', authRequired, deleteEvento)

export default router;