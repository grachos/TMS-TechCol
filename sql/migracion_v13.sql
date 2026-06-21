-- ==========================================================
--  Light TMS - Migración v13: dueno_poliza en solicitud_servicio.
--  Importar DESPUÉS de migracion_v12.sql.
-- ==========================================================

SET NAMES utf8mb4;

ALTER TABLE solicitud_servicio
    ADD COLUMN IF NOT EXISTS dueno_poliza VARCHAR(1) NULL DEFAULT 'N' COMMENT '[DUENOPOLIZA]';

ALTER TABLE remesa
    ADD COLUMN IF NOT EXISTS dueno_poliza VARCHAR(1) NULL DEFAULT 'N' COMMENT '[DUENOPOLIZA]';
