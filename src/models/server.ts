

import express from 'express';
import cors from 'cors';
import db from '../db/connection';
import bodyParser from 'body-parser'; // Agrega esto
import authRoutes from '../routes/auth.routes';
import bodegasRoutes from '../routes/bodega.routes';
import eventosRoutes from '../routes/evento.routes';
import cookieParser from 'cookie-parser'

export class Server {
    private app: express.Application;
    private port: string;
    private apiPaths = {
        auth: '/api/auth',
        eventos: '/api/eventos',
        bodegas: '/api/bodegas'
    }

    constructor() {
        this.app = express();
        this.port = process.env.PORT || '8000';
        this.dbConnection();
        this.middlewares();
        this.routes();
    }

    async dbConnection() {
        try {
            await db.authenticate();
            console.log('Database connected');
        } catch (error) {
            throw new Error(String(error));
        }
    }

    middlewares() {

  // 3. Body parsing
  this.app.use(express.json({ limit: '50mb' }));
  this.app.use(express.urlencoded({ extended: true, limit: '50mb' }));
  

    this.app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    console.log('Headers:', req.headers);
  
  // Verifica si el middleware de JSON está funcionando
  if (req.headers['content-type'] === 'application/json') {
    console.log('Body type: JSON');
  } else {
    console.log('Body type:', req.headers['content-type'] || 'unknown');
  }
  
  // Solo muestra el body para solicitudes pequeñas
const contentLength = req.headers['content-length'];
let length = 0;

if (typeof contentLength === 'string') {
  length = parseInt(contentLength, 10);
} else if (Array.isArray(contentLength)) {
  length = parseInt(contentLength[0], 10);
} 
{
    console.log('Body:', req.body);
  }
  
  next();
    });
  // 2. CORS
  this.app.use(cors({
    origin: 'http://localhost:5173',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  }));

  // Cookie parser 
  this.app.use(cookieParser());
  // 4. Logging
  this.app.use((req, res, next) => {
    console.log(`${req.method} ${req.path}`);
    console.log('Headers:', req.headers);
    console.log('Parsed body:', req.body); // Body parseado
    console.log('Raw body:', (req as any).rawBody); // Body en bruto
    next();
  });
}
    routes() {
        this.app.use(this.apiPaths.auth, authRoutes);
        this.app.use(this.apiPaths.bodegas, bodegasRoutes);
        this.app.use(this.apiPaths.eventos, eventosRoutes);
    }

    async listen() {
        try {
          
          // await db.query('SET FOREIGN_KEY_CHECKS = 0');
        
          // await db.sync({ force: true });
        
          // // Reactivar FK checks
          // await db.query('SET FOREIGN_KEY_CHECKS = 1');
        
          // console.log('Tablas sincronizadas (force)');
          this.app.listen(this.port, () => {
          console.log("Servidor corriendo en puerto " + this.port);
        });
        } catch (error) {
              console.error('Error sincronizando tablas:', error);
        }
    }
}