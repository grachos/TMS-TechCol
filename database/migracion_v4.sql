-- ==========================================================
--  Light TMS - Migración v4: vehículo solo con campos requeridos + remolque.
--  Quita columnas no obligatorias y agrega el enlace al remolque (otro vehículo).
-- ==========================================================

SET NAMES utf8mb4;

ALTER TABLE vehiculo
    DROP COLUMN IF EXISTS num_ejes,
    DROP COLUMN IF EXISTS cod_carroceria,
    DROP COLUMN IF EXISTS cod_combustible,
    DROP COLUMN IF EXISTS capacidad,
    DROP COLUMN IF EXISTS num_chasis,
    DROP COLUMN IF EXISTS num_soat,
    DROP COLUMN IF EXISTS venc_soat,
    ADD COLUMN IF NOT EXISTS remolque_placa VARCHAR(6) NULL COMMENT 'Placa del remolque (otro vehículo) [NUMPLACAREMOLQUE]';
