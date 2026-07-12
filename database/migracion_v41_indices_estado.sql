-- migracion_v41_indices_estado.sql
-- Índices para los contadores de los badges de navegación, que son las consultas
-- más frecuentes de la app (cada navegador abierto los sondea cada 20s y el
-- watcher del servidor cada 60s). Sin estos índices, cada conteo escanea la
-- tabla completa de tercero / vehiculo / manifiesto.
--
-- remesa.estado_rndc ya está indexado (idx_remesa_estado), por eso no está aquí.

ALTER TABLE tercero
  ADD INDEX IF NOT EXISTS idx_tercero_estado (estado_rndc);

ALTER TABLE vehiculo
  ADD INDEX IF NOT EXISTS idx_vehiculo_estado (estado_rndc);

ALTER TABLE manifiesto
  ADD INDEX IF NOT EXISTS idx_manifiesto_cumplido (cumplido_estado_rndc);
