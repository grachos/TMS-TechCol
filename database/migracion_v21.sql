-- migracion_v21.sql
-- Renombra cantidad_cargada → cantidad_vehiculos en solicitud_servicio.
ALTER TABLE solicitud_servicio CHANGE cantidad_cargada cantidad_vehiculos INT NOT NULL DEFAULT 1 COMMENT 'Vehículos/dispachos restantes';
-- Agrega columna para el valor original del contador (para mostrar X/Y en el listado).
ALTER TABLE solicitud_servicio ADD COLUMN cantidad_vehiculos_original INT NOT NULL DEFAULT 1 COMMENT 'Valor inicial del contador de vehículos' AFTER cantidad_vehiculos;
-- Poblar con el valor actual en registros existentes.
UPDATE solicitud_servicio SET cantidad_vehiculos_original = cantidad_vehiculos WHERE cantidad_vehiculos_original = 1;
