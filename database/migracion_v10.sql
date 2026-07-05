-- ==========================================================
--  Light TMS - Migración v10: consecutivos de remesa y manifiesto.
--  Agrega contadores auto-incrementales para generar
--  el consecutivo de remesa y manifiesto desde la empresa.
--  Importar DESPUÉS de migracion_v9.sql.
-- ==========================================================

SET NAMES utf8mb4;

ALTER TABLE maestro_empresa
    ADD COLUMN IF NOT EXISTS consecutivo_remesa     BIGINT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'Último consecutivo usado para remesa',
    ADD COLUMN IF NOT EXISTS consecutivo_manifiesto BIGINT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'Último consecutivo usado para manifiesto';
