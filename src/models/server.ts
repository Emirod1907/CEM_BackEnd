import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import https from 'https';
import cors from 'cors';
import db from '../db/connection';
import authRoutes from '../routes/auth.routes';
import salonesRoutes from '../routes/salon.routes';
import eventosRoutes from '../routes/evento.routes';
import adminRoutes from '../routes/admin.routes';
import pagosRoutes from '../routes/pago.routes';
import reservasRoutes from '../routes/reserva.routes';
import serviciosRoutes from '../routes/servicio.routes';
import invitacionesRoutes from '../routes/invitacion.routes'
import valoracionesRoutes from '../routes/valoracion.routes';
import contratosRoutes from '../routes/contrato.routes';
import comisionesRoutes from '../routes/comision.routes';
import autorizacionesRoutes from '../routes/autorizacion.routes';
import pedidosTortaRoutes from '../routes/pedidoTorta.routes';
import cookieParser from 'cookie-parser'
import { seed } from '../db/seed'
import passport from '../config/passport';
import { getMpCredentials, getMpEncryptionKey } from '../config/mercadopago';
import { iniciarJobLiberacionVencidas } from '../jobs/liberarReservasVencidas';
import { iniciarJobVerificarPagos } from '../jobs/verificarPagosPendientes';
import { obtenerCertificadoLocal } from '../libs/certLocal';
import { verificarEmail } from '../services/email.service';
import { logger } from '../libs/logger';
import { errorHandler } from '../middlewares/errorHandler';
import { globalLimiter } from '../middlewares/rateLimiter';

export class Server {
    private app: express.Application;
    private port: string;
    private apiPaths = {
        auth: '/api/auth',
        eventos: '/api/eventos',
        salones: '/api/salones',
        admin: '/api/admin',
        pagos: '/api/pagos',
        reservas: '/api/reservas',
        servicios: '/api/servicios',
        invitaciones: '/api/invitaciones',
        valoraciones: '/api/valoraciones',
        contratos: '/api/contratos',
        comisiones: '/api/comisiones',
        autorizaciones: '/api/autorizaciones',
        pedidosTorta: '/api/pedidos-torta',
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
            logger.info('Database connected');
        } catch (error) {
            throw new Error(String(error));
        }
    }

    middlewares() {

  // 3. Body parsing
  // El callback `verify` captura el raw body SOLO para el webhook de MercadoPago,
  // que necesita los bytes originales para validar la firma HMAC.
  this.app.use(express.json({
    limit: '1mb',
    verify: (req: any, _res, buf) => {
      if (req.originalUrl === '/api/pagos/webhook') {
        req.rawBody = buf;
      }
    }
  }));
  this.app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  

    // Middleware de acceso HTTP: loguea método + path + status + duración
    this.app.use((req, res, next) => {
        const start = Date.now();
        res.on('finish', () => {
            const duration = Date.now() - start;
            logger.info(`${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
        });
        next();
    });
  // 2. CORS
  const allowedOrigins = (process.env.CORS_ORIGIN || process.env.FRONTEND_URL || 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  this.app.use(cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error(`Origen no permitido por CORS: ${origin}`));
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  }));

  // Cookie parser
  this.app.use(cookieParser());

  // Rate limiting global (excluye /api/pagos/webhook que tiene su propio bucket)
  this.app.use(globalLimiter);

  // Passport
  this.app.use(passport.initialize());
}
    routes() {
        this.app.use(this.apiPaths.auth, authRoutes);
        this.app.use(this.apiPaths.salones, salonesRoutes);
        this.app.use(this.apiPaths.eventos, eventosRoutes);
        this.app.use(this.apiPaths.admin, adminRoutes);
        this.app.use(this.apiPaths.pagos, pagosRoutes);
        this.app.use(this.apiPaths.reservas, reservasRoutes);
        this.app.use(this.apiPaths.servicios, serviciosRoutes);
        this.app.use(this.apiPaths.invitaciones, invitacionesRoutes);
        this.app.use(this.apiPaths.valoraciones, valoracionesRoutes);
        this.app.use(this.apiPaths.contratos, contratosRoutes);
        this.app.use(this.apiPaths.comisiones, comisionesRoutes);
        this.app.use(this.apiPaths.autorizaciones, autorizacionesRoutes);
        this.app.use(this.apiPaths.pedidosTorta, pedidosTortaRoutes);
        // Error handler global — debe ir después de todas las rutas
        this.app.use(errorHandler);
    }

    async listen() {
        try {
          // Validar credenciales de MercadoPago antes de arrancar
          try {
              const creds = getMpCredentials()
              getMpEncryptionKey()
              logger.info(`[MP] Modo: ${creds.env} | Client ID: ${creds.clientId}`)
          } catch (mpErr: any) {
              logger.error('[MP] Configuración inválida — el servidor no puede arrancar', { error: mpErr.message })
              process.exit(1)
          }

          const autoSeedOnStart = process.env.AUTO_SEED_ON_START !== 'false';
          if (autoSeedOnStart) {
              await seed();
          } else {
              logger.info('[Seed] Seed automático desactivado por AUTO_SEED_ON_START=false');
          }

          // Diagnóstico de SMTP (no bloquea el arranque): loguea si el mail funciona
          verificarEmail();

          iniciarJobLiberacionVencidas();
          iniciarJobVerificarPagos();
          this.app.listen(this.port, () => {
          logger.info(`Servidor corriendo en puerto ${this.port}`);
        });

          // Puente HTTPS local para las back_urls de MercadoPago (solo en dev,
          // cuando el frontend es http). MP exige https para mostrar el botón
          // "Volver al sitio" y el contador de auto_return en el checkout.
          const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
          if (!frontendUrl.startsWith('https://')) {
              try {
                  const puertoHttps = process.env.MP_RETORNO_PORT || '8443';
                  const { key, cert } = await obtenerCertificadoLocal();
                  const servidorHttps = https.createServer({ key, cert }, this.app);
                  // Sin este handler, un EADDRINUSE en 8443 tumbaría todo el proceso
                  servidorHttps.on('error', (err: any) => {
                      if (err.code === 'EADDRINUSE') {
                          logger.warn(`[MP] Puerto ${puertoHttps} ocupado — puente HTTPS de retorno desactivado (¿otra instancia corriendo?)`);
                      } else {
                          logger.error('[MP] Error en el puente HTTPS de retorno', { error: err.message });
                      }
                  });
                  servidorHttps.listen(puertoHttps, () => {
                      logger.info(`[MP] Puente HTTPS de retorno en https://localhost:${puertoHttps}`);
                  });
              } catch (httpsErr: any) {
                  logger.error('[MP] No se pudo iniciar el puente HTTPS de retorno', { error: httpsErr.message });
              }
          }
        } catch (error) {
              logger.error('Error sincronizando tablas', { error: String(error) });
        }
    }
}