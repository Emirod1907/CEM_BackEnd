-- ─────────────────────────────────────────────────────────────────────────────
-- Corrección Feature 1: Contrato pasa de un solo comision_porcentaje a dos
-- campos separados (modelo de comisión de dos lados).
-- Idempotente: usa information_schema para no fallar si ya fue aplicado.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Renombrar comision_porcentaje → comision_cliente_porcentaje
SET @renames = (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'Contratos'
      AND COLUMN_NAME  = 'comision_porcentaje'
);
SET @sql_rename = IF(@renames > 0,
    'ALTER TABLE Contratos CHANGE COLUMN comision_porcentaje comision_cliente_porcentaje DECIMAL(5,2) NOT NULL',
    'SELECT ''comision_porcentaje ya fue renombrado'' AS info'
);
PREPARE s FROM @sql_rename; EXECUTE s; DEALLOCATE PREPARE s;

-- 2. Agregar comision_proveedor_porcentaje si no existe
SET @adds = (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'Contratos'
      AND COLUMN_NAME  = 'comision_proveedor_porcentaje'
);
SET @sql_add = IF(@adds = 0,
    'ALTER TABLE Contratos ADD COLUMN comision_proveedor_porcentaje DECIMAL(5,2) NOT NULL DEFAULT 3 AFTER comision_cliente_porcentaje',
    'SELECT ''comision_proveedor_porcentaje ya existe'' AS info'
);
PREPARE s FROM @sql_add; EXECUTE s; DEALLOCATE PREPARE s;
