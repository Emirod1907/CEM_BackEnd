import { Router } from "express";
import authRequired from '../middlewares/validateToken';
import { getBodegas, getBodega , crearBodega, updateBodega, deleteBodega } from '../controllers/bodega.controller'

const router = Router()

router.get('/bodegas', authRequired, getBodegas)
router.get('/bodegas/:id', authRequired, getBodega)
router.post('/bodega/new', authRequired, crearBodega)
router.put('/bodega/:id', authRequired, updateBodega)
router.delete('/:id', authRequired, deleteBodega)

export default router;