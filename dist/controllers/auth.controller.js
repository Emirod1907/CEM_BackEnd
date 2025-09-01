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
exports.logout = exports.login = exports.register = void 0;
const persona_1 = __importDefault(require("../models/persona"));
const jwt_1 = require("../libs/jwt");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const register = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    if (!req.body || Object.keys(req.body).length === 0) {
        console.error("Request body is empty");
        return res.status(400).json({ message: "Request body is missing" });
    }
    console.log("Request body:", req.body);
    const { nombre, apellido, dni, fecha_nacimiento, email, nombre_usuario, user_password } = req.body;
    try {
        console.log("Request body:", req.body);
        const existingUser = yield persona_1.default.findOne({ where: { email } });
        if (existingUser) {
            return res.status(400).json({ message: "El correo ya está registrado" });
        }
        const salt = yield bcryptjs_1.default.genSalt(10);
        const hashedPassword = yield bcryptjs_1.default.hash(user_password, salt);
        const newPersona = yield persona_1.default.create({
            nombre,
            apellido,
            dni,
            fecha_nacimiento,
            email,
            nombre_usuario,
            user_password: hashedPassword,
        });
        console.log("Request body:", req.body);
        const token = yield (0, jwt_1.generateToken)({ id_persona: newPersona.id_persona });
        res.cookie('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict'
        }),
            res.json({
                msg: "Usuario creado con éxito",
                persona: {
                    id_persona: newPersona.id_persona,
                    nombre: newPersona.nombre,
                    email: newPersona.email
                }
            });
    }
    catch (error) {
        res.status(500).json({ message: "error message", error });
    }
});
exports.register = register;
const login = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { email, user_password } = req.body;
    try {
        const persona = yield persona_1.default.findOne({ where: { email } });
        if (!persona) {
            res.status(400).json({ message: "No se encontró el usuario" });
            return;
        }
        else {
            console.log("Email buscado:", email);
            console.log("Usuario encontrado:", persona ? persona.email : "Ninguno");
            const validPassword = yield bcryptjs_1.default.compare(user_password, persona.user_password);
            console.log("Contraseña recibida:", user_password);
            console.log("Hash almacenado:", persona === null || persona === void 0 ? void 0 : persona.user_password);
            if (!validPassword) {
                res.status(400).json({ message: "Contraseña incorrecta" });
                return;
            }
            const token = yield (0, jwt_1.generateToken)({ id_persona: persona.id_persona });
            res.cookie('token', token, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'strict'
            });
            res.json({ message: "Sesion iniciada con exito",
                id_persona: persona.id_persona,
                user: persona.nombre,
                email: persona.email,
            });
        }
    }
    catch (error) {
        res.status(500).json({
            message: "Error en el servidor", error
        });
    }
});
exports.login = login;
const logout = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    res.clearCookie('token');
    res.json({ msg: "Sesion cerrada con Exito!" });
});
exports.logout = logout;
