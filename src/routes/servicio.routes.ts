import { Router } from 'express';
import authRequired from '../middlewares/validateToken';
import contratoVigenteRequired from '../middlewares/contratoVigenteRequired';
import uploadExcel from '../middlewares/uploadExcel';
import {
    getServicios,
    getDisponibilidad,
    crearServicio,
    updateServicio,
    deleteServicio,
    getMisServicios,
    crearServicioProveedor,
    updateServicioProveedor,
    deleteServicioProveedor,
    getMisReservasProveedor,
    getMiAgenda,
    crearBloqueoManual,
    updateBloqueoManual,
    confirmarReservaProveedor,
    eliminarBloqueo
} from '../controllers/servicio.controller';
import {
    getPlantillaExcel,
    previewImportarExcel,
    confirmarImportarExcel,
} from '../controllers/importarServicios.controller';

const router = Router();

// ── Importación masiva desde Excel (ANTES de /:id para no colisionar) ──────────
router.get('/plantilla-excel', authRequired, getPlantillaExcel);
router.post('/importar-excel/preview',   authRequired, contratoVigenteRequired, uploadExcel.single('archivo'), previewImportarExcel);
router.post('/importar-excel/confirmar', authRequired, contratoVigenteRequired, uploadExcel.single('archivo'), confirmarImportarExcel);

// Rutas de la tiendita del proveedor (deben ir ANTES de /:id para no colisionar)
router.get('/mis-servicios', authRequired, getMisServicios);
router.get('/mis-reservas', authRequired, getMisReservasProveedor);
router.post('/mis-servicios', authRequired, contratoVigenteRequired, crearServicioProveedor);
router.put('/mis-servicios/:id', authRequired, contratoVigenteRequired, updateServicioProveedor);
router.delete('/mis-servicios/:id', authRequired, deleteServicioProveedor);

// Agenda del proveedor
router.get('/mi-agenda', authRequired, getMiAgenda);
router.post('/mi-agenda', authRequired, crearBloqueoManual);
router.put('/mi-agenda/confirmar/:reserva_id', authRequired, confirmarReservaProveedor);
router.put('/mi-agenda/:id', authRequired, updateBloqueoManual);
router.delete('/mi-agenda/:id', authRequired, eliminarBloqueo);

// Disponibilidad de servicios para una fecha
router.get('/disponibilidad', authRequired, getDisponibilidad);

// Rutas generales / admin
router.get('/', authRequired, getServicios);
router.post('/', authRequired, crearServicio);
router.put('/:id', authRequired, updateServicio);
router.delete('/:id', authRequired, deleteServicio);

export default router;
