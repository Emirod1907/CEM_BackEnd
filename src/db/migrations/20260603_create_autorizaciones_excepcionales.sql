-- ─────────────────────────────────────────────────────────────────────────────
-- Migración: crear tabla AutorizacionesExcepcionales
-- Idempotente: CREATE TABLE IF NOT EXISTS (la tabla nunca existió antes)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS AutorizacionesExcepcionales (
    id_autorizacion  INT              NOT NULL AUTO_INCREMENT,
    persona_id       INT              NOT NULL,
    accion           VARCHAR(100)     NOT NULL,
    recurso_tipo     VARCHAR(50)      NOT NULL,
    recurso_id       INT              NOT NULL,
    motivo_solicitud TEXT             NOT NULL,
    estado           ENUM(
                         'solicitada',
                         'aprobada',
                         'consumida',
                         'rechazada',
                         'expirada'
                     )                NOT NULL DEFAULT 'solicitada',
    solicitada_por   INT              NOT NULL,
    aprobada_por     INT              NULL,
    fecha_solicitud  DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_aprobacion DATETIME         NULL,
    fecha_consumo    DATETIME         NULL,

    PRIMARY KEY (id_autorizacion),

    -- Búsqueda del middleware: persona + accion + recurso + estado en una sola pasada
    INDEX idx_autorizacion_lookup (persona_id, accion, recurso_id, estado),

    -- Listado admin de pendientes
    INDEX idx_autorizacion_estado (estado),

    CONSTRAINT fk_autorizacion_persona
        FOREIGN KEY (persona_id)
        REFERENCES Personas (id_persona)
        ON DELETE CASCADE ON UPDATE CASCADE,

    CONSTRAINT fk_autorizacion_solicitada_por
        FOREIGN KEY (solicitada_por)
        REFERENCES Personas (id_persona)
        ON DELETE CASCADE ON UPDATE CASCADE,

    CONSTRAINT fk_autorizacion_aprobada_por
        FOREIGN KEY (aprobada_por)
        REFERENCES Personas (id_persona)
        ON DELETE SET NULL ON UPDATE CASCADE

) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_unicode_ci;
