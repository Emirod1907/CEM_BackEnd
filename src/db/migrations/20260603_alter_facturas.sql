-- ─────────────────────────────────────────────────────────────────────────────
-- Corrección Feature 3: Facturas — desglose_id → orden_id, campos nuevos
-- Idempotente mediante information_schema.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Renombrar desglose_id → orden_id (si aún existe desglose_id)
SET @has_desglose = (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Facturas' AND COLUMN_NAME = 'desglose_id'
);
SET @s1 = IF(@has_desglose > 0,
    'ALTER TABLE Facturas DROP FOREIGN KEY fk_factura_desglose',
    'SELECT "sin fk desglose" AS info'
);
PREPARE s FROM @s1; EXECUTE s; DEALLOCATE PREPARE s;

SET @s2 = IF(@has_desglose > 0,
    'ALTER TABLE Facturas CHANGE COLUMN desglose_id orden_id INT NOT NULL',
    'SELECT "desglose_id ya fue renombrado" AS info'
);
PREPARE s FROM @s2; EXECUTE s; DEALLOCATE PREPARE s;

-- 2. Cambiar tipo_comprobante a ENUM('A','B','C') si actualmente es INT
SET @tc_type = (
    SELECT DATA_TYPE FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Facturas' AND COLUMN_NAME = 'tipo_comprobante'
);
SET @s3 = IF(@tc_type = 'int',
    "ALTER TABLE Facturas MODIFY COLUMN tipo_comprobante ENUM('A','B','C') NOT NULL DEFAULT 'C'",
    'SELECT "tipo_comprobante ya es ENUM" AS info'
);
PREPARE s FROM @s3; EXECUTE s; DEALLOCATE PREPARE s;

-- 3. Agregar campos nuevos si no existen
SET @has_cae_v = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Facturas' AND COLUMN_NAME = 'cae_vencimiento');
SET @s4 = IF(@has_cae_v = 0,
    'ALTER TABLE Facturas ADD COLUMN cae_vencimiento DATE NULL AFTER cae',
    'SELECT "cae_vencimiento ya existe" AS info'
);
PREPARE s FROM @s4; EXECUTE s; DEALLOCATE PREPARE s;

SET @has_fe = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Facturas' AND COLUMN_NAME = 'fecha_emision');
SET @s5 = IF(@has_fe = 0,
    'ALTER TABLE Facturas ADD COLUMN fecha_emision DATETIME NULL AFTER monto',
    'SELECT "fecha_emision ya existe" AS info'
);
PREPARE s FROM @s5; EXECUTE s; DEALLOCATE PREPARE s;

SET @has_dr = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Facturas' AND COLUMN_NAME = 'datos_receptor');
SET @s6 = IF(@has_dr = 0,
    'ALTER TABLE Facturas ADD COLUMN datos_receptor TEXT NULL',
    'SELECT "datos_receptor ya existe" AS info'
);
PREPARE s FROM @s6; EXECUTE s; DEALLOCATE PREPARE s;

SET @has_xml = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Facturas' AND COLUMN_NAME = 'xml_respuesta');
SET @s7 = IF(@has_xml = 0,
    'ALTER TABLE Facturas ADD COLUMN xml_respuesta TEXT NULL',
    'SELECT "xml_respuesta ya existe" AS info'
);
PREPARE s FROM @s7; EXECUTE s; DEALLOCATE PREPARE s;

-- 4. Eliminar columna persona_id si existe (queda identificado por orden → persona)
SET @has_pid = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Facturas' AND COLUMN_NAME = 'persona_id');
SET @s8 = IF(@has_pid > 0,
    'ALTER TABLE Facturas DROP COLUMN persona_id',
    'SELECT "persona_id no existe o ya fue eliminado" AS info'
);
PREPARE s FROM @s8; EXECUTE s; DEALLOCATE PREPARE s;

-- 5. Agregar FK orden_id → Ordenes si no existe
SET @has_fk_orden = (
    SELECT COUNT(*) FROM information_schema.KEY_COLUMN_USAGE
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Facturas'
      AND COLUMN_NAME = 'orden_id' AND REFERENCED_TABLE_NAME = 'Ordenes'
);
SET @s9 = IF(@has_fk_orden = 0,
    'ALTER TABLE Facturas ADD CONSTRAINT fk_factura_orden FOREIGN KEY (orden_id) REFERENCES Ordenes(id_orden) ON DELETE CASCADE',
    'SELECT "fk_factura_orden ya existe" AS info'
);
PREPARE s FROM @s9; EXECUTE s; DEALLOCATE PREPARE s;
