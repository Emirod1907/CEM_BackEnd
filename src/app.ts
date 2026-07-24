import dotenv from'dotenv'
import dns from 'node:dns'
import { Server } from './models/server';

// Railway (y muchos PaaS) no tienen salida IPv6. Si Node resuelve un host
// (ej. smtp.gmail.com) por IPv6 primero, la conexión falla con ENETUNREACH.
// Forzar IPv4 primero evita ese problema para TODAS las conexiones salientes.
dns.setDefaultResultOrder('ipv4first')

dotenv.config()

import { logger } from './libs/logger';
logger.info(`Iniciando servidor en puerto ${process.env.PORT || '8000'}`);

const server =  new Server();

server.listen();