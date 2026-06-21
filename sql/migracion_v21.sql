-- migracion_v21.sql
-- Renombra cantidad_cargada → cantidad_vehiculos en solicitud_servicio.
ALTER TABLE solicitud_servicio CHANGE cantidad_cargada cantidad_vehiculos INT NOT NULL DEFAULT 1 COMMENT 'Vehículos/dispachos restantes';
