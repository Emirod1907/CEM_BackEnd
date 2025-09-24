import { Router } from "express";
import authRequired from '../middlewares/validateToken';
import { getBodegas, getBodega , crearBodega, updateBodega, deleteBodega } from '../controllers/bodega.controller'

const router = Router()

router.get('/', authRequired, getBodegas)
router.get('/:id', authRequired, getBodega)
router.post('/new', authRequired, crearBodega)
router.put('/:id', authRequired, updateBodega)
router.delete('/:id', authRequired, deleteBodega)

export default router;