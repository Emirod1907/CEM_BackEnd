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
exports.register = void 0;
const persona_1 = __importDefault(require("../models/persona"));
const register = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { nombre, apellido, dni, fecha_nacimiento, email, nombre_usuario, user_password } = req.body;
    try {
        const existingUser = yield persona_1.default.findOne({ where: { email } });
        if (existingUser) {
            return res.status(400).json({ message: "El correo ya está registrado" });
        }
        const newPersona = yield persona_1.default.create({
            nombre,
            apellido,
            dni,
            fecha_nacimiento,
            email,
            nombre_usuario,
            user_password,
        });
        const personaSaved = yield newPersona.save();
        res.json(personaSaved);
    }
    catch (error) {
        console.log(error);
    }
});
exports.register = register;
