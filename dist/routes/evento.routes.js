"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const validateToken_1 = __importDefault(require("../middlewares/validateToken"));
const evento_controller_1 = require("../controllers/evento.controller");
const router = (0, express_1.Router)();
router.get('/eventos', evento_controller_1.getEventos);
router.get('/eventos/:id', evento_controller_1.getEvento);
router.post('/evento/new', validateToken_1.default, evento_controller_1.crearEvento);
router.put('/:id', validateToken_1.default, evento_controller_1.updateEvento);
router.delete('/:id', validateToken_1.default, evento_controller_1.deleteEvento);
exports.default = router;
