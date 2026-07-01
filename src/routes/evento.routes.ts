import { Router } from "express";
import authRequired from "../middlewares/validateToken";
import { crearEvento, deleteEvento, getEvento, getEventos, updateEvento } from "../controllers/evento.controller";
import { getPozo, crearMovimientoPozo } from "../controllers/pozo.controller";

const router = Router()

router.get('/', getEventos)
// Pozo común del evento (solo el organizador creador)
router.get('/:id/pozo', authRequired, getPozo)
router.post('/:id/pozo/movimiento', authRequired, crearMovimientoPozo)
router.get('/:id', getEvento)
router.post('/new', authRequired, crearEvento)
router.put('/:id', authRequired, updateEvento)
router.delete('/:id', authRequired, deleteEvento)

export default router;