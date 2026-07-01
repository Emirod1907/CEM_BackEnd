-- Migración: Soporte para Google OAuth
-- Ejecutar una sola vez en la base de datos CEM

USE CEM;

-- 1. Agregar columna google_id (nullable, unique)
ALTER TABLE Personas
    ADD COLUMN google_id VARCHAR(255) NULL UNIQUE AFTER email;

-- 2. Hacer nullable user_password para usuarios de OAuth
ALTER TABLE Personas
    MODIFY COLUMN user_password VARCHAR(255) NULL;

-- 3. Hacer nullable dni (no disponible en cuentas de Google)
ALTER TABLE Personas
    MODIFY COLUMN dni VARCHAR(255) NULL;

-- 4. Hacer nullable fecha_nacimiento (no disponible en cuentas de Google)
ALTER TABLE Personas
    MODIFY COLUMN fecha_nacimiento DATE NULL;

-- 5. Hacer nullable nombre_usuario (se genera automáticamente para usuarios de Google)
ALTER TABLE Personas
    MODIFY COLUMN nombre_usuario VARCHAR(255) NULL;
