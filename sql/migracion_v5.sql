-- ==========================================================
--  Light TMS - Migración v5: el vehículo no captura marca/modelo
--  (los hereda el RNDC del RUNT por la placa).
-- ==========================================================

SET NAMES utf8mb4;

ALTER TABLE vehiculo
    DROP COLUMN IF EXISTS cod_marca,
    DROP COLUMN IF EXISTS marca,
    DROP COLUMN IF EXISTS ano_fabricacion;
