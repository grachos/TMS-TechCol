-- ==========================================================
--  Light TMS - Migración v9: elimina REMDUENOPOLIZA.
--  El campo tomador_poliza no es aceptado por el RNDC.
--  Importar DESPUÉS de migracion_v8.sql.
-- ==========================================================

SET NAMES utf8mb4;

ALTER TABLE solicitud_servicio
    DROP COLUMN IF EXISTS tomador_poliza;

ALTER TABLE remesa
    DROP COLUMN IF EXISTS tomador_poliza;
