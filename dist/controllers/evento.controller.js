"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteEvento = exports.updateEvento = exports.getEvento = exports.getEventos = exports.crearEvento = void 0;
const evento_1 = __importDefault(require("../models/evento"));
const reserva_1 = __importDefault(require("../models/reserva"));
const crearEvento = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const _a = req.body, { bodega_id, fecha } = _a, eventoData = __rest(_a, ["bodega_id", "fecha"]);
    try {
        const reservaExistente = yield reserva_1.default.findOne({ where: { bodega_id, fecha } });
        if (reservaExistente) {
            res.status(400).json({ message: "Bodega no disponible" });
        }
        const newEvento = yield evento_1.default.create(eventoData);
        yield reserva_1.default.create({
            evento_id: newEvento.id_evento,
            bodega_id,
            fecha,
        });
        res.json({
            msg: "Evento creado satisfactoriamente con su reserva",
            evento: {
                nombre: newEvento.nombre,
                descripcion: newEvento.descripcion,
                fecha: newEvento.fecha
            }
        });
    }
    catch (error) {
        console.error(error);
    }
});
exports.crearEvento = crearEvento;
const getEventos = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const response = yield evento_1.default.findAll();
        res.json({ response });
    }
    catch (error) {
        console.error(error);
    }
});
exports.getEventos = getEventos;
const getEvento = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { id_evento } = req.params;
    try {
        const response = yield evento_1.default.findByPk(id_evento);
        res.json({ response });
    }
    catch (error) {
        console.error(error);
    }
});
exports.getEvento = getEvento;
const updateEvento = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { id_evento } = req.params;
    const { body } = req.body;
    try {
        const response = yield evento_1.default.update;
    }
    catch (error) {
        console.error(error);
    }
});
exports.updateEvento = updateEvento;
const deleteEvento = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { id_evento } = req.params;
    try {
        const response = yield evento_1.default.destroy();
    }
    catch (error) {
        console.error(error);
    }
});
exports.deleteEvento = deleteEvento;
