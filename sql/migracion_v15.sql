-- ==========================================================
--  Light TMS - Migración v15: consecutivos como string en empresa.
--  Importar DESPUÉS de migracion_v14.sql.
-- ==========================================================

SET NAMES utf8mb4;

ALTER TABLE maestro_empresa
    MODIFY consecutivo_remesa     VARCHAR(20) NOT NULL DEFAULT 'REM-00000',
    MODIFY consecutivo_manifiesto VARCHAR(20) NOT NULL DEFAULT 'MAN-00000',
    DROP COLUMN IF EXISTS radicado_remesa;
