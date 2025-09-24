import { Router } from "express";
import authRequired from "../middlewares/validateToken";
import { crearEvento, deleteEvento, getEvento, getEventos, updateEvento } from "../controllers/evento.controller";

const router = Router()

router.get('/', getEventos)
router.get('/:id', getEvento)
router.post('/new', authRequired, crearEvento)
router.put('/:id', authRequired, updateEvento)
router.delete('/:id', authRequired, deleteEvento)

export default router;