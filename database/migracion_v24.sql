-- migracion_v24.sql
-- Agrega remesa_id a cola_envios para agrupar items por despacho.
ALTER TABLE cola_envios ADD COLUMN IF NOT EXISTS remesa_id BIGINT UNSIGNED NULL COMMENT 'remesa del despacho (para procesar individualmente)';
