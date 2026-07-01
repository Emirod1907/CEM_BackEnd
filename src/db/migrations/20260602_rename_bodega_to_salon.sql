-- ============================================================================
-- Migración: Renombrar columnas bodega → salon
-- Fecha: 2026-06-02
-- Descripción: El sistema fue creado originalmente para bodegas y luego
--              generalizado para salones de eventos. Esta migración renombra
--              las columnas restantes para consistencia del dominio.
--
-- Cambios:
--   Salones.id_bodega  → Salones.id_salon
--   reservas.bodega_id → reservas.salon_id
--   Eventos.bodega_id  → Eventos.salon_id
--
-- INSTRUCCIONES:
--   Ejecutar ANTES de iniciar el servidor con el código actualizado:
--     mysql -u <usuario> -p <base_datos> < 20260602_rename_bodega_to_salon.sql
--
-- NOTA: Las FK constraints en MySQL se identifican por nombre generado
--       por InnoDB. El script intenta eliminarlas de forma segura usando
--       IF EXISTS (requiere MySQL 8.0.19+). En versiones anteriores ignorar
--       el error de DROP y proceder con los CHANGE.
-- ============================================================================

-- ─── 1. Eliminar FKs que referencian Salones.id_bodega (si existen) ──────────

-- reservas → Salones
SET @fk1 = (
    SELECT CONSTRAINT_NAME
    FROM information_schema.KEY_COLUMN_USAGE
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'reservas'
      AND COLUMN_NAME = 'bodega_id'
      AND REFERENCED_TABLE_NAME = 'Salones'
    LIMIT 1
);
SET @sql1 = IF(@fk1 IS NOT NULL,
    CONCAT('ALTER TABLE reservas DROP FOREIGN KEY `', @fk1, '`'),
    'SELECT 1'
);
PREPARE stmt1 FROM @sql1;
EXECUTE stmt1;
DEALLOCATE PREPARE stmt1;

-- Eventos → Salones
SET @fk2 = (
    SELECT CONSTRAINT_NAME
    FROM information_schema.KEY_COLUMN_USAGE
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'Eventos'
      AND COLUMN_NAME = 'bodega_id'
      AND REFERENCED_TABLE_NAME = 'Salones'
    LIMIT 1
);
SET @sql2 = IF(@fk2 IS NOT NULL,
    CONCAT('ALTER TABLE Eventos DROP FOREIGN KEY `', @fk2, '`'),
    'SELECT 1'
);
PREPARE stmt2 FROM @sql2;
EXECUTE stmt2;
DEALLOCATE PREPARE stmt2;

-- ─── 2. Renombrar la PK de Salones ───────────────────────────────────────────
ALTER TABLE Salones CHANGE id_bodega id_salon INT NOT NULL AUTO_INCREMENT;

-- ─── 3. Renombrar las FK columns ─────────────────────────────────────────────
ALTER TABLE reservas CHANGE bodega_id salon_id INT NOT NULL;
ALTER TABLE Eventos  CHANGE bodega_id salon_id INT NOT NULL;

-- ─── 4. Recrear FKs con nombres consistentes ─────────────────────────────────
ALTER TABLE reservas
    ADD CONSTRAINT fk_reservas_salon
        FOREIGN KEY (salon_id) REFERENCES Salones (id_salon)
        ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE Eventos
    ADD CONSTRAINT fk_eventos_salon
        FOREIGN KEY (salon_id) REFERENCES Salones (id_salon)
        ON UPDATE CASCADE ON DELETE RESTRICT;
