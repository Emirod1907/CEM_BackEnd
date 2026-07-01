import { Router } from 'express';
import authRequired from '../middlewares/validateToken';
import { validateBody } from '../middlewares/validateBody';
import { solicitarReservaSchema, actualizarServiciosSchema } from '../schemas/reserva.schema';
import { solicitarReserva, getMisReservas, getReservaDetalle, actualizarServiciosReserva, cancelarReserva, eliminarReservaCancelada } from '../controllers/reserva.controller';

const router = Router();

router.post('/solicitar', authRequired, validateBody(solicitarReservaSchema), solicitarReserva);
router.get('/mis-reservas', authRequired, getMisReservas);
router.get('/:id', authRequired, getReservaDetalle);
router.put('/:id/servicios', authRequired, validateBody(actualizarServiciosSchema), actualizarServiciosReserva);
router.delete('/:id/cancelar', authRequired, cancelarReserva);
router.delete('/:id', authRequired, eliminarReservaCancelada);

export default router;
