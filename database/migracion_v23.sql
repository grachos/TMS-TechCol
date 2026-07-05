-- migracion_v23.sql
-- CODIGOUN + ESTADOMERCANCIA para mercancía peligrosa (Naturaleza Carga = 2).
ALTER TABLE producto            ADD COLUMN IF NOT EXISTS codigo_un       VARCHAR(5) NULL COMMENT '[CODIGOUN]';
ALTER TABLE producto            ADD COLUMN IF NOT EXISTS estado_producto VARCHAR(1) NULL COMMENT 'L=Liquido, S=Solido/semi-solido, G=Gaseoso [ESTADOMERCANCIA]';
ALTER TABLE solicitud_servicio  ADD COLUMN IF NOT EXISTS codigo_un       VARCHAR(5) NULL COMMENT '[CODIGOUN]';
ALTER TABLE solicitud_servicio  ADD COLUMN IF NOT EXISTS estado_producto VARCHAR(1) NULL COMMENT '[ESTADOMERCANCIA]';
ALTER TABLE remesa              ADD COLUMN IF NOT EXISTS codigo_un       VARCHAR(5) NULL COMMENT '[CODIGOUN]';
ALTER TABLE remesa              ADD COLUMN IF NOT EXISTS estado_producto VARCHAR(1) NULL COMMENT '[ESTADOMERCANCIA]';
