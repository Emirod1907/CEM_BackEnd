import { Router } from 'express';
import authRequired from '../middlewares/validateToken';
import adminRequired from '../middlewares/adminRequired';
import { getRoles, getPermisos, updateRolPermisos } from '../controllers/admin.controller';
import { getComisiones, updateComision, getHistorialComision } from '../controllers/comision.controller';
import { getLiquidaciones, getLiquidacionProveedor, emitirFacturaHandler, liquidarDesglose } from '../controllers/liquidacion.controller';
import { getPendientes, aprobarAutorizacion, rechazarAutorizacion } from '../controllers/autorizacion.controller';

const router = Router();

router.get('/roles', authRequired, adminRequired, getRoles);
router.get('/permisos', authRequired, adminRequired, getPermisos);
router.put('/roles/:id/permisos', authRequired, adminRequired, updateRolPermisos);

router.get('/comisiones', authRequired, adminRequired, getComisiones);
router.put('/comisiones/:tipo_perfil', authRequired, adminRequired, updateComision);
router.get('/comisiones/:tipo_perfil/historial', authRequired, adminRequired, getHistorialComision);

router.get('/liquidaciones', authRequired, adminRequired, getLiquidaciones);
router.get('/liquidaciones/proveedor/:persona_id', authRequired, adminRequired, getLiquidacionProveedor);
router.post('/liquidaciones/:orden_id/liquidar', authRequired, adminRequired, liquidarDesglose);
router.post('/facturas/emitir/:orden_id', authRequired, adminRequired, emitirFacturaHandler);

router.get('/autorizaciones/pendientes', authRequired, adminRequired, getPendientes);
router.post('/autorizaciones/:id/aprobar', authRequired, adminRequired, aprobarAutorizacion);
router.post('/autorizaciones/:id/rechazar', authRequired, adminRequired, rechazarAutorizacion);

export default router;
