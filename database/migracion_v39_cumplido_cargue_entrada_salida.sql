-- migracion_v39_cumplido_cargue_entrada_salida.sql
-- Cumplido de remesa: RNDC exige tambien entrada/salida del cargue (no solo llegada)
-- cuando esas citas no se capturaron al crear la remesa. Sin estos campos, el RNDC
-- rechaza el cumplido con CRE100/CRE120/CRE130/CRE150 por fechas/horas de cargue faltantes.

ALTER TABLE remesa
  ADD COLUMN IF NOT EXISTS fecha_entrada_cargue  DATE        NULL AFTER hora_llegada_cargue,
  ADD COLUMN IF NOT EXISTS hora_entrada_cargue    VARCHAR(5)  NULL AFTER fecha_entrada_cargue,
  ADD COLUMN IF NOT EXISTS fecha_salida_cargue    DATE        NULL AFTER hora_entrada_cargue,
  ADD COLUMN IF NOT EXISTS hora_salida_cargue     VARCHAR(5)  NULL AFTER fecha_salida_cargue;
