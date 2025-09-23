"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const validateToken_1 = __importDefault(require("../middlewares/validateToken"));
const bodega_controller_1 = require("../controllers/bodega.controller");
const router = (0, express_1.Router)();
router.get('/bodegas', validateToken_1.default, bodega_controller_1.getBodegas);
router.get('/bodegas/:id', validateToken_1.default, bodega_controller_1.getBodega);
router.post('/bodega/new', validateToken_1.default, bodega_controller_1.crearBodega);
router.put('/bodega/:id', validateToken_1.default, bodega_controller_1.updateBodega);
router.delete('/:id', validateToken_1.default, bodega_controller_1.deleteBodega);
exports.default = router;
