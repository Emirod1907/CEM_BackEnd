import { Sequelize } from 'sequelize';
import 'dotenv/config';

const db = new Sequelize(
    process.env.DB_NAME || 'CEM',
    process.env.DB_USER || 'root',
    process.env.DB_PASS || '',
    {
        host: process.env.DB_HOST || '127.0.0.1',
        port: Number(process.env.DB_PORT || 3306),
        dialect: 'mysql',
    }
);

export default db;