-- ==========================================================
--  Light TMS - Migración v6: estado 'despachada' en la Solicitud.
--  Una solicitud es editable mientras NO esté 'despachada'.
-- ==========================================================

SET NAMES utf8mb4;

ALTER TABLE solicitud_servicio
    MODIFY estado ENUM('borrador','procesada','despachada','anulada') NOT NULL DEFAULT 'borrador';
