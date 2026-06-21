-- ==========================================================
--  Light TMS - Migración v14: conductor por defecto en vehículo.
--  Importar DESPUÉS de migracion_v13.sql.
-- ==========================================================

SET NAMES utf8mb4;

ALTER TABLE vehiculo
    ADD COLUMN IF NOT EXISTS conductor_tipo_id VARCHAR(2)  NULL COMMENT '[CODTIPOIDCONDUCTOR] conductor por defecto',
    ADD COLUMN IF NOT EXISTS conductor_num_id  VARCHAR(15) NULL COMMENT '[NUMIDCONDUCTOR] conductor por defecto';
