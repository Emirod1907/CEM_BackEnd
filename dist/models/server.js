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
exports.Server = void 0;
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const connection_1 = __importDefault(require("../db/connection"));
const auth_routes_1 = __importDefault(require("../routes/auth.routes"));
const bodega_routes_1 = __importDefault(require("../routes/bodega.routes"));
const evento_routes_1 = __importDefault(require("../routes/evento.routes"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
class Server {
    constructor() {
        this.apiPaths = {
            auth: '/api/auth',
            eventos: '/api/eventos',
            bodegas: '/api/bodegas'
        };
        this.app = (0, express_1.default)();
        this.port = process.env.PORT || '8000';
        this.dbConnection();
        this.middlewares();
        this.routes();
    }
    dbConnection() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                yield connection_1.default.authenticate();
                console.log('Database connected');
            }
            catch (error) {
                throw new Error(String(error));
            }
        });
    }
    middlewares() {
        // 3. Body parsing
        this.app.use(express_1.default.json({ limit: '50mb' }));
        this.app.use(express_1.default.urlencoded({ extended: true, limit: '50mb' }));
        this.app.use((req, res, next) => {
            console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
            console.log('Headers:', req.headers);
            // Verifica si el middleware de JSON está funcionando
            if (req.headers['content-type'] === 'application/json') {
                console.log('Body type: JSON');
            }
            else {
                console.log('Body type:', req.headers['content-type'] || 'unknown');
            }
            // Solo muestra el body para solicitudes pequeñas
            const contentLength = req.headers['content-length'];
            let length = 0;
            if (typeof contentLength === 'string') {
                length = parseInt(contentLength, 10);
            }
            else if (Array.isArray(contentLength)) {
                length = parseInt(contentLength[0], 10);
            }
            {
                console.log('Body:', req.body);
            }
            next();
        });
        // 2. CORS
        this.app.use((0, cors_1.default)({
            origin: 'http://localhost:5173',
            methods: ['GET', 'POST', 'PUT', 'DELETE'],
            allowedHeaders: ['Content-Type', 'Authorization'],
            credentials: true,
        }));
        // Cookie parser 
        this.app.use((0, cookie_parser_1.default)());
        // 4. Logging
        this.app.use((req, res, next) => {
            console.log(`${req.method} ${req.path}`);
            console.log('Headers:', req.headers);
            console.log('Parsed body:', req.body); // Body parseado
            console.log('Raw body:', req.rawBody); // Body en bruto
            next();
        });
    }
    routes() {
        this.app.use(this.apiPaths.auth, auth_routes_1.default);
        this.app.use(this.apiPaths.bodegas, bodega_routes_1.default);
        this.app.use(this.apiPaths.eventos, evento_routes_1.default);
    }
    listen() {
        this.app.listen(this.port, () => {
            console.log("Servidor corriendo en puerto " + this.port);
        });
    }
}
exports.Server = Server;
