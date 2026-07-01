-- ─────────────────────────────────────────────────────────────────────────────
-- Feature 3: OrdenDesglose + Facturas
-- Ejecutar UNA SOLA VEZ sobre la base de datos de producción/staging.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Tabla de desglose de comisiones internas (nunca visible al cliente)
CREATE TABLE IF NOT EXISTS OrdenDesglose (
    id_desglose                  INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
    orden_id                     INT          NOT NULL,
    reserva_id                   INT          NULL,
    monto_bruto                  DECIMAL(10,2) NOT NULL,
    comision_cliente_porcentaje  DECIMAL(5,2)  NOT NULL DEFAULT 0,
    monto_comision_cliente       DECIMAL(10,2) NOT NULL DEFAULT 0,
    comision_proveedor_porcentaje DECIMAL(5,2) NOT NULL DEFAULT 0,
    monto_comision_proveedor     DECIMAL(10,2) NOT NULL DEFAULT 0,
    monto_neto_proveedor         DECIMAL(10,2) NOT NULL DEFAULT 0,
    estado_liquidacion           ENUM('pendiente','liquidado','facturado') NOT NULL DEFAULT 'pendiente',
    factura_id                   INT          NULL,
    fecha                        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_desglose_orden    FOREIGN KEY (orden_id)    REFERENCES Ordenes(id_orden)     ON DELETE CASCADE,
    CONSTRAINT fk_desglose_reserva  FOREIGN KEY (reserva_id)  REFERENCES reservas(id_reserva)  ON DELETE SET NULL,
    CONSTRAINT uq_desglose_orden    UNIQUE (orden_id)
);

CREATE INDEX idx_desglose_estado   ON OrdenDesglose(estado_liquidacion);
CREATE INDEX idx_desglose_reserva  ON OrdenDesglose(reserva_id);

-- 2. Tabla de facturas electrónicas ARCA/AFIP
CREATE TABLE IF NOT EXISTS Facturas (
    id_factura           INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
    desglose_id          INT          NOT NULL,
    persona_id           INT          NOT NULL,
    tipo_comprobante     INT          NOT NULL DEFAULT 11,   -- 11=Factura C
    punto_venta          INT          NOT NULL DEFAULT 1,
    numero_comprobante   INT          NULL,
    cae                  VARCHAR(20)  NULL,                  -- Código Autorización Electrónico
    fecha_vencimiento_cae DATE        NULL,
    monto                DECIMAL(10,2) NOT NULL,
    estado               ENUM('pendiente','emitida','error') NOT NULL DEFAULT 'pendiente',
    error_detalle        TEXT         NULL,
    fecha                DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_factura_desglose  FOREIGN KEY (desglose_id) REFERENCES OrdenDesglose(id_desglose) ON DELETE CASCADE,
    CONSTRAINT fk_factura_persona   FOREIGN KEY (persona_id)  REFERENCES Personas(id_persona)       ON DELETE RESTRICT
);

CREATE INDEX idx_factura_desglose       ON Facturas(desglose_id);
CREATE INDEX idx_factura_persona_estado ON Facturas(persona_id, estado);

-- 3. FK de OrdenDesglose.factura_id → Facturas (circularidad resuelta: Facturas ya existe)
ALTER TABLE OrdenDesglose
    ADD CONSTRAINT fk_desglose_factura
    FOREIGN KEY (factura_id) REFERENCES Facturas(id_factura) ON DELETE SET NULL;
