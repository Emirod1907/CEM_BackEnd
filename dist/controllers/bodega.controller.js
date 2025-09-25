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
exports.deleteBodega = exports.updateBodega = exports.getBodega = exports.getBodegas = exports.crearBodega = void 0;
const bodega_1 = __importDefault(require("../models/bodega"));
const crearBodega = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    console.log('🔍 === INICIO crearBodega ===');
    console.log('📨 Método:', req.method);
    console.log('🔗 URL:', req.url);
    console.log('🍪 Cookies:', req.cookies);
    console.log('📦 Body recibido:', req.body);
    const { nombre, domicilio, descripcion, imagen, aforo } = req.body;
    console.log('Datos recibidos:', req.body);
    try {
        if (!nombre || !domicilio || !aforo) {
            return res.status(400).json({ message: "Nombre, domicilio y aforo son requeridos" });
        }
        const existingBodega = yield bodega_1.default.findOne({ where: { nombre } });
        if (existingBodega) {
            return res.status(400).json({ message: "La Bodega ya existe" });
        }
        const newBodega = yield bodega_1.default.create({
            nombre,
            domicilio,
            descripcion: descripcion || '',
            imagen: imagen || '',
            aforo: parseInt(aforo)
        });
        res.json({
            msg: "Bodega creada con éxito",
            bodega: {
                id_bodega: newBodega.id_bodega,
                nombre: newBodega.nombre,
                domicilio: newBodega.domicilio
            }
        });
    }
    catch (error) {
        console.error('❌ Error al crear bodega:', error);
        res.status(500).json({
            message: "error interno del servidor",
            error: error.message
        });
    }
});
exports.crearBodega = crearBodega;
const getBodegas = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const response = yield bodega_1.default.findAll();
        res.json({ response });
    }
    catch (error) {
        console.error(error);
    }
});
exports.getBodegas = getBodegas;
const getBodega = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { id_bodega } = req.params;
    try {
        const response = yield bodega_1.default.findByPk(id_bodega);
        res.json({ response });
    }
    catch (error) {
        console.error(error);
    }
});
exports.getBodega = getBodega;
const updateBodega = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { id_bodega } = req.params;
    const { body } = req.body;
    try {
        const response = yield bodega_1.default.update;
    }
    catch (error) {
        console.error(error);
    }
});
exports.updateBodega = updateBodega;
const deleteBodega = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { id_bodega } = req.params;
    try {
        const response = yield bodega_1.default.destroy();
    }
    catch (error) {
        console.error(error);
    }
});
exports.deleteBodega = deleteBodega;
