-- migracion_v30.sql
-- Cumplido de remesa y manifiesto (procesoid 5 y 6)

ALTER TABLE remesa
  ADD COLUMN IF NOT EXISTS cumplido_tipo              VARCHAR(1)  NULL COMMENT 'C=normal S=suspendido' AFTER dueno_poliza,
  ADD COLUMN IF NOT EXISTS cantidad_entregada         DECIMAL(14,3) NULL AFTER cumplido_tipo,
  ADD COLUMN IF NOT EXISTS fecha_llegada_descargue    DATE        NULL AFTER cantidad_entregada,
  ADD COLUMN IF NOT EXISTS hora_llegada_descargue     VARCHAR(5)  NULL AFTER fecha_llegada_descargue,
  ADD COLUMN IF NOT EXISTS fecha_entrada_descargue    DATE        NULL AFTER hora_llegada_descargue,
  ADD COLUMN IF NOT EXISTS hora_entrada_descargue     VARCHAR(5)  NULL AFTER fecha_entrada_descargue,
  ADD COLUMN IF NOT EXISTS fecha_salida_descargue     DATE        NULL AFTER hora_entrada_descargue,
  ADD COLUMN IF NOT EXISTS hora_salida_descargue      VARCHAR(5)  NULL AFTER fecha_salida_descargue,
  ADD COLUMN IF NOT EXISTS fecha_llegada_cargue       DATE        NULL AFTER hora_salida_descargue,
  ADD COLUMN IF NOT EXISTS hora_llegada_cargue        VARCHAR(5)  NULL AFTER fecha_llegada_cargue,
  ADD COLUMN IF NOT EXISTS cumplido_estado_rndc       VARCHAR(20) NOT NULL DEFAULT 'pendiente' AFTER hora_llegada_cargue,
  ADD COLUMN IF NOT EXISTS cumplido_rndc_ingreso_id   VARCHAR(40) NULL AFTER cumplido_estado_rndc;

ALTER TABLE manifiesto
  ADD COLUMN IF NOT EXISTS cumplido_tipo               VARCHAR(1)  NULL COMMENT 'C=normal S=suspendido' AFTER emf,
  ADD COLUMN IF NOT EXISTS fecha_entrega_documentos    DATE        NULL AFTER cumplido_tipo,
  ADD COLUMN IF NOT EXISTS valor_adicional_flete       DECIMAL(14,2) NULL AFTER fecha_entrega_documentos,
  ADD COLUMN IF NOT EXISTS valor_descuento_flete       DECIMAL(14,2) NULL AFTER valor_adicional_flete,
  ADD COLUMN IF NOT EXISTS observaciones_cumplido      TEXT        NULL AFTER valor_descuento_flete,
  ADD COLUMN IF NOT EXISTS cumplido_estado_rndc        VARCHAR(20) NOT NULL DEFAULT 'pendiente' AFTER observaciones_cumplido,
  ADD COLUMN IF NOT EXISTS cumplido_rndc_ingreso_id    VARCHAR(40) NULL AFTER cumplido_estado_rndc;
