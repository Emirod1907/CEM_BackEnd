import { Router } from 'express';
import authRequired from '../middlewares/validateToken';
import { validateBody } from '../middlewares/validateBody';
import { solicitarReservaSchema, actualizarServiciosSchema } from '../schemas/reserva.schema';
import { solicitarReserva, getMisReservas, getReservaDetalle, actualizarServiciosReserva, cambiarFechaReserva, cancelarReserva, eliminarReservaCancelada, getCancelacionPreview } from '../controllers/reserva.controller';

const router = Router();

router.post('/solicitar', authRequired, validateBody(solicitarReservaSchema), solicitarReserva);
router.get('/mis-reservas', authRequired, getMisReservas);
router.get('/:id/cancelacion-preview', authRequired, getCancelacionPreview);
router.get('/:id', authRequired, getReservaDetalle);
router.put('/:id/servicios', authRequired, validateBody(actualizarServiciosSchema), actualizarServiciosReserva);
router.patch('/:id/fecha', authRequired, cambiarFechaReserva);
router.delete('/:id/cancelar', authRequired, cancelarReserva);
router.delete('/:id', authRequired, eliminarReservaCancelada);

export default router;
