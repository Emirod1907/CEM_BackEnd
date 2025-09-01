import dotenv from'dotenv'
import { Server } from './models/server';

dotenv.config()

console.log(process.env.PORT);

const server =  new Server();

server.listen();