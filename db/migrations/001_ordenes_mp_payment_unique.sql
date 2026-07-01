-- FIX 4: Idempotencia del webhook de MercadoPago
-- Agrega restricción UNIQUE a mp_payment_id en la tabla Ordenes.
-- MySQL permite múltiples NULL en columnas UNIQUE, por lo que las órdenes
-- pendientes (sin pago aún) no se ven afectadas.
--
-- EJECUTAR MANUALMENTE antes de reiniciar el servidor.

ALTER TABLE Ordenes
    ADD CONSTRAINT uq_ordenes_mp_payment_id UNIQUE (mp_payment_id);
