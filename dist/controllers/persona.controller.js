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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deletePersona = exports.putPersona = exports.postPersona = exports.getPersona = exports.getPersonas = void 0;
const persona_1 = __importDefault(require("../models/persona"));
const getPersonas = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const personas = yield persona_1.default.findAll();
        res.json({ personas });
    }
    catch (error) {
        res.status(500).json({ message: "Error al obtener las personas", error });
    }
});
exports.getPersonas = getPersonas;
const getPersona = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { id } = req.params;
    const persona = yield persona_1.default.findByPk(id);
    if (persona) {
        res.json({
            persona,
            id
        });
    }
    else {
        res.status(404).json({
            msg: `no se encontro el usuario con id ${id}`
        });
    }
});
exports.getPersona = getPersona;
const postPersona = (req, res) => {
    const { body } = req;
    res.json({
        msg: "post persona",
        body
    });
};
exports.postPersona = postPersona;
const putPersona = (req, res) => {
    const { id } = req.params;
    const { body } = req;
    res.json({
        msg: "put Persona",
        id,
        body
    });
};
exports.putPersona = putPersona;
const deletePersona = (req, res) => {
    const { id } = req.params;
    res.json({
        msg: "Eliminar usuario",
        id
    });
};
exports.deletePersona = deletePersona;
