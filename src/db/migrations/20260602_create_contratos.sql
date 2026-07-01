-- ============================================================================
-- Migración: Crear tabla Contratos
-- Fecha: 2026-06-02
-- Descripción: Sistema de contratos digitales con aceptación de T&C y snapshot
--              de comisión para proveedores y dueños de salón.
--
-- INSTRUCCIONES:
--   Ejecutar manualmente en la base de datos antes de iniciar el servidor:
--     mysql -u <usuario> -p <base_de_datos> < 20260602_create_contratos.sql
--
-- NOTAS:
--   - NO uses sync({ alter: true }) para aplicar este cambio.
--   - El campo comision_porcentaje es INMUTABLE una vez creado el registro.
--   - ip_aceptacion es VARCHAR(45) para soportar tanto IPv4 como IPv6.
--   - user_agent es VARCHAR(500) para cubrir strings largos de navegadores modernos.
-- ============================================================================

CREATE TABLE IF NOT EXISTS Contratos (
    id_contrato       INT            NOT NULL AUTO_INCREMENT,
    persona_id        INT            NOT NULL,
    version_terminos  VARCHAR(20)    NOT NULL,
    comision_porcentaje DECIMAL(5,2) NOT NULL,
    texto_terminos    TEXT           NOT NULL,
    hash_terminos     VARCHAR(64)    NOT NULL,
    aceptado          TINYINT(1)     NOT NULL DEFAULT 0,
    fecha_aceptacion  DATETIME       NULL,
    ip_aceptacion     VARCHAR(45)    NULL,
    user_agent        VARCHAR(500)   NULL,
    estado            ENUM('vigente','revocado','reemplazado') NOT NULL DEFAULT 'vigente',
    createdAt         DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt         DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (id_contrato),

    -- Índice compuesto para que contratoVigenteRequired sea O(log n) en lugar de full scan
    INDEX idx_contratos_persona_estado (persona_id, estado),

    CONSTRAINT fk_contratos_persona
        FOREIGN KEY (persona_id)
        REFERENCES Personas (id_persona)
        ON DELETE CASCADE
        ON UPDATE CASCADE

) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci
  COMMENT='Contratos digitales aceptados por proveedores y dueños de salón (Ley 25.506)';
