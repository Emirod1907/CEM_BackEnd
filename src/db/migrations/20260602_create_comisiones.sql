-- ============================================================================
-- Migración: Crear tablas ConfiguracionComisiones e HistorialComisiones
-- Fecha: 2026-06-02
-- Descripción: Panel de configuración de comisiones por perfil, administrable
--              por el admin. Incluye historial de auditoría.
--
-- INSTRUCCIONES:
--   Ejecutar manualmente DESPUÉS de haber aplicado 20260602_create_contratos.sql:
--     mysql -u <usuario> -p <base_de_datos> < 20260602_create_comisiones.sql
--
-- NOTAS:
--   - NO uses sync({ alter: true }) para aplicar este cambio.
--   - tipo_perfil es UNIQUE: un registro por tipo de perfil.
--   - HistorialComisiones no tiene ON DELETE CASCADE en config_id para preservar
--     el historial aunque la config sea eliminada.
-- ============================================================================

-- ─── Tabla principal ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ConfiguracionComisiones (
    id_config                    INT           NOT NULL AUTO_INCREMENT,
    tipo_perfil                  VARCHAR(50)   NOT NULL,
    comision_cliente_porcentaje  DECIMAL(5,2)  NOT NULL,
    comision_proveedor_porcentaje DECIMAL(5,2) NOT NULL,
    activo                       TINYINT(1)    NOT NULL DEFAULT 1,
    actualizado_por              INT           NULL,
    fecha_actualizacion          DATETIME      NULL,
    createdAt                    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt                    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (id_config),
    UNIQUE KEY uq_comisiones_tipo_perfil (tipo_perfil),
    INDEX idx_comisiones_activo (activo),

    CONSTRAINT fk_comisiones_actualizado_por
        FOREIGN KEY (actualizado_por)
        REFERENCES Personas (id_persona)
        ON DELETE SET NULL
        ON UPDATE CASCADE

) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci
  COMMENT='Configuración de comisiones por tipo de perfil (salon, catering, etc.)';

-- ─── Tabla de auditoría ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS HistorialComisiones (
    id_historial      INT          NOT NULL AUTO_INCREMENT,
    config_id         INT          NOT NULL,
    tipo_perfil       VARCHAR(50)  NOT NULL,
    cliente_anterior  DECIMAL(5,2) NOT NULL,
    cliente_nuevo     DECIMAL(5,2) NOT NULL,
    proveedor_anterior DECIMAL(5,2) NOT NULL,
    proveedor_nuevo    DECIMAL(5,2) NOT NULL,
    admin_id          INT          NOT NULL,
    fecha             DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (id_historial),
    INDEX idx_historial_config   (config_id),
    INDEX idx_historial_tipo     (tipo_perfil),
    INDEX idx_historial_admin    (admin_id),
    INDEX idx_historial_fecha    (fecha),

    -- Sin CASCADE: preservar historial aunque se elimine la config
    CONSTRAINT fk_historial_config
        FOREIGN KEY (config_id)
        REFERENCES ConfiguracionComisiones (id_config)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,

    CONSTRAINT fk_historial_admin
        FOREIGN KEY (admin_id)
        REFERENCES Personas (id_persona)
        ON DELETE RESTRICT
        ON UPDATE CASCADE

) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci
  COMMENT='Auditoría de cambios de comisiones — quién cambió qué y cuándo';
