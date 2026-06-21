-- migracion_v20.sql
-- Elimina valor_anticipo de solicitud_servicio (se conserva en manifiesto).
ALTER TABLE solicitud_servicio DROP COLUMN IF EXISTS valor_anticipo;
