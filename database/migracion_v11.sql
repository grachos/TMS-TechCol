-- ==========================================================
--  Light TMS - Migración v11: radicado de remesa.
--  Agrega contador auto-incremental para RADICADOREMESA.
--  Importar DESPUÉS de migracion_v10.sql.
-- ==========================================================

SET NAMES utf8mb4;

ALTER TABLE maestro_empresa
    ADD COLUMN IF NOT EXISTS radicado_remesa BIGINT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'Último radicado usado para remesa';
