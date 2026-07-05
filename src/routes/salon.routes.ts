import { Router } from "express";
import authRequired from '../middlewares/validateToken';
import contratoVigenteRequired from '../middlewares/contratoVigenteRequired';
import { getSalones, getSalon , crearSalon, updateSalon, deleteSalon, getDisponibilidadSalon, getMiSalon, getMiSalonReservas, actualizarPreciosSalon, gestionarReservaDueno, crearReservaManual, getSalonesDisponibles } from '../controllers/salon.controller'
import { googleCalendarConnect, googleCalendarCallback, googleCalendarStatus, googleCalendarDisconnect, importarCalendario, sincronizarReservasExistentes } from '../controllers/calendar.controller'

const router = Router()

router.get('/disponibles', getSalonesDisponibles)
router.get('/', getSalones)
router.get('/mi-salon', authRequired, getMiSalon)
router.get('/mi-salon/reservas', authRequired, getMiSalonReservas)
router.put('/mi-salon/precios', authRequired, actualizarPreciosSalon)
router.post('/mi-salon/reservas/manual', authRequired, crearReservaManual)
router.put('/mi-salon/reservas/:id/estado', authRequired, gestionarReservaDueno)
// Google Calendar OAuth (dueño de salón)
router.get('/google/connect', authRequired, googleCalendarConnect)
router.get('/google/callback', googleCalendarCallback)
router.get('/google/status', authRequired, googleCalendarStatus)
router.post('/google/disconnect', authRequired, googleCalendarDisconnect)
router.post('/google/importar', authRequired, importarCalendario)
router.post('/google/sync-reservas', authRequired, sincronizarReservasExistentes)
router.get('/:id/disponibilidad', authRequired, getDisponibilidadSalon)
router.get('/:id', authRequired, getSalon)
router.post('/new', authRequired, contratoVigenteRequired('salon'), crearSalon)
router.put('/:id', authRequired, contratoVigenteRequired('salon'), updateSalon)
router.delete('/:id', authRequired, deleteSalon)

export default router;
