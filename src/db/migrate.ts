import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import mysql from 'mysql2/promise';
import { applyPostMigrationSchemaPatches, applyPreMigrationSchemaPatches } from './schema-patches';

dotenv.config();

const REQUIRED_ENV = ['DB_HOST', 'DB_NAME', 'DB_USER'];

const getEnv = (key: string, fallback?: string): string => {
  const value = process.env[key] ?? fallback;
  if (value === undefined || value === '') {
    throw new Error(`Falta configurar ${key} en CEM_BackEnd/.env`);
  }
  return value;
};

const assertRequiredEnv = () => {
  const missing = REQUIRED_ENV.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Variables de entorno faltantes: ${missing.join(', ')}`);
  }
};

const getMigrationsDirectory = (): string => {
  const candidates = [
    path.resolve(process.cwd(), 'src/db/migrations'),
    path.resolve(process.cwd(), 'dist/db/migrations'),
  ];

  const migrationsDir = candidates.find((candidate) => fs.existsSync(candidate));
  if (!migrationsDir) {
    throw new Error(`No se encontró la carpeta de migraciones. Rutas revisadas: ${candidates.join(', ')}`);
  }

  return migrationsDir;
};

const run = async () => {
  assertRequiredEnv();

  const connection = await mysql.createConnection({
    host: getEnv('DB_HOST', '127.0.0.1'),
    port: Number(process.env.DB_PORT || 3306),
    user: getEnv('DB_USER'),
    password: process.env.DB_PASS || '',
    database: getEnv('DB_NAME'),
    multipleStatements: true,
  });

  try {
    console.log('[DB] Aplicando parches de compatibilidad previos...');
    await applyPreMigrationSchemaPatches(connection);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS MigracionesEjecutadas (
        id INT NOT NULL AUTO_INCREMENT,
        nombre VARCHAR(255) NOT NULL,
        ejecutada_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_migraciones_nombre (nombre)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    const migrationsDir = getMigrationsDirectory();
    const files = fs
      .readdirSync(migrationsDir)
      .filter((file) => file.endsWith('.sql'))
      .sort();

    if (files.length === 0) {
      console.log('[DB] No hay migraciones SQL para ejecutar.');
    }

    for (const file of files) {
      const [rows] = await connection.query(
        'SELECT nombre FROM MigracionesEjecutadas WHERE nombre = ? LIMIT 1',
        [file]
      );

      if (Array.isArray(rows) && rows.length > 0) {
        console.log(`[DB] Saltando migración ya ejecutada: ${file}`);
        continue;
      }

      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, 'utf8').trim();

      if (!sql) {
        console.log(`[DB] Saltando migración vacía: ${file}`);
        continue;
      }

      console.log(`[DB] Ejecutando migración: ${file}`);
      await connection.query(sql);
      await connection.query('INSERT INTO MigracionesEjecutadas (nombre) VALUES (?)', [file]);
      console.log(`[DB] OK: ${file}`);
    }

    console.log('[DB] Aplicando parches de compatibilidad posteriores...');
    await applyPostMigrationSchemaPatches(connection);

    console.log('[DB] Migraciones y parches finalizados correctamente.');
  } finally {
    await connection.end();
  }
};

run().catch((error) => {
  console.error('[DB] Error ejecutando migraciones:', error instanceof Error ? error.message : error);
  process.exit(1);
});
