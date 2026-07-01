-- ─────────────────────────────────────────────────────────────────────────────
-- Feature 4: agrega precio_base a ServiciosAdicionales
-- Ejecutar UNA SOLA VEZ sobre la base de datos de producción/staging.
-- ─────────────────────────────────────────────────────────────────────────────

-- Agrega precio_base solo si no existe (compatible con MySQL 5.7+)
SET @existe = (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'ServiciosAdicionales'
      AND COLUMN_NAME  = 'precio_base'
);
SET @sql = IF(@existe = 0,
    'ALTER TABLE ServiciosAdicionales ADD COLUMN precio_base DECIMAL(10,2) NULL',
    'SELECT ''precio_base ya existe, nada que hacer'' AS info'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
