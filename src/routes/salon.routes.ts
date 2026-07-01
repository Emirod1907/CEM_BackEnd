import { Router } from "express";
import authRequired from '../middlewares/validateToken';
import contratoVigenteRequired from '../middlewares/contratoVigenteRequired';
import { getSalones, getSalon , crearSalon, updateSalon, deleteSalon, getDisponibilidadSalon, getMiSalon, getMiSalonReservas, actualizarPreciosSalon, gestionarReservaDueno, crearReservaManual, getSalonesDisponibles } from '../controllers/salon.controller'

const router = Router()

router.get('/disponibles', getSalonesDisponibles)
router.get('/', getSalones)
router.get('/mi-salon', authRequired, getMiSalon)
router.get('/mi-salon/reservas', authRequired, getMiSalonReservas)
router.put('/mi-salon/precios', authRequired, actualizarPreciosSalon)
router.post('/mi-salon/reservas/manual', authRequired, crearReservaManual)
router.put('/mi-salon/reservas/:id/estado', authRequired, gestionarReservaDueno)
router.get('/:id/disponibilidad', authRequired, getDisponibilidadSalon)
router.get('/:id', authRequired, getSalon)
router.post('/new', authRequired, contratoVigenteRequired, crearSalon)
router.put('/:id', authRequired, contratoVigenteRequired, updateSalon)
router.delete('/:id', authRequired, deleteSalon)

export default router;
