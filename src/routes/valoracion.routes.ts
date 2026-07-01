import { Router } from 'express';
import authRequired from '../middlewares/validateToken';
import {
    crearValoraciones,
    getValoracionesReserva,
    getValoracionesSalon,
    getRecomendados,
} from '../controllers/valoracion.controller';

const router = Router();

// Público — no requiere auth
router.get('/recomendados', getRecomendados);
router.get('/salon/:salon_id', getValoracionesSalon);

// Requieren autenticación
router.post('/', authRequired, crearValoraciones);
router.get('/reserva/:id', authRequired, getValoracionesReserva);

export default router;
