import dotenv from'dotenv'
import { Server } from './models/server';

dotenv.config()

import { logger } from './libs/logger';
logger.info(`Iniciando servidor en puerto ${process.env.PORT || '8000'}`);

const server =  new Server();

server.listen();