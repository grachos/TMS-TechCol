-- migracion_v43_cola_tipo_documento_anulacion.sql
--
-- Repite exactamente el problema (y el arreglo) de migracion_v37: el ENUM de
-- cola_envios.tipo_documento nunca se amplió con los 5 tipos nuevos de
-- anulación, así que en un MySQL no-estricto cada INSERT con esos valores
-- se guardó silenciosamente como '' en vez de fallar. Por eso "Categoría" y
-- "Documento" salían vacíos en Cola de envíos para esas filas.
--
-- Esto es más grave que el problema cosmético de v37: como tipo_documento
-- quedó '', marcarOrigen() (que decide qué actualizar según ese valor) NUNCA
-- coincidió con 'anular_cumplido_manifiesto'/'anular_cumplido_remesa'/etc.
-- Si el RNDC YA aceptó esa anulación (fila en estado 'enviado', con
-- rndc_ingreso_id real), el documento origen se quedó con el estado viejo
-- ('aceptado') en vez de pasar a 'pendiente'/'anulado'. Este script repara
-- ambas cosas: el tipo_documento corrupto y el estado del documento origen
-- que la anulación real ya había cambiado en el RNDC.

ALTER TABLE cola_envios
    MODIFY COLUMN tipo_documento ENUM(
        'remesa','manifiesto','tercero','vehiculo',
        'cumplido_remesa','cumplido_manifiesto',
        'anular_cumplido_manifiesto','anular_cumplido_remesa',
        'anular_cumplido_inicial_remesa','anular_manifiesto','anular_remesa'
    ) NOT NULL;

-- 1) Repara el tipo_documento corrupto — proceso_rndc sí se guardó bien al
--    insertar, así que identifica de forma confiable cada tipo real.
UPDATE cola_envios SET tipo_documento = 'anular_cumplido_manifiesto'  WHERE tipo_documento = '' AND proceso_rndc = 29;
UPDATE cola_envios SET tipo_documento = 'anular_cumplido_remesa'      WHERE tipo_documento = '' AND proceso_rndc = 28;
UPDATE cola_envios SET tipo_documento = 'anular_cumplido_inicial_remesa' WHERE tipo_documento = '' AND proceso_rndc = 54;
UPDATE cola_envios SET tipo_documento = 'anular_manifiesto'           WHERE tipo_documento = '' AND proceso_rndc = 32;
UPDATE cola_envios SET tipo_documento = 'anular_remesa'               WHERE tipo_documento = '' AND proceso_rndc = 9;

-- 2) Repara el estado del documento origen para las filas que YA fueron
--    aceptadas por el RNDC (estado='enviado', con ingreso real) mientras el
--    tipo_documento estaba corrupto — marcarOrigen() nunca las procesó.
--    Cumplido anulado -> vuelve a 'pendiente' (re-cumplible y reenviable).
UPDATE manifiesto m
  JOIN cola_envios c ON c.referencia_id = m.id
    AND c.tipo_documento = 'anular_cumplido_manifiesto' AND c.estado = 'enviado'
SET m.cumplido_estado_rndc = 'pendiente', m.cumplido_rndc_ingreso_id = NULL
WHERE m.cumplido_estado_rndc = 'aceptado';

UPDATE remesa r
  JOIN cola_envios c ON c.referencia_id = r.id
    AND c.tipo_documento = 'anular_cumplido_remesa' AND c.estado = 'enviado'
SET r.cumplido_estado_rndc = 'pendiente', r.cumplido_rndc_ingreso_id = NULL
WHERE r.cumplido_estado_rndc = 'aceptado';

-- Documento base anulado -> 'anulado' + número de anulación real del RNDC.
UPDATE manifiesto m
  JOIN cola_envios c ON c.referencia_id = m.id
    AND c.tipo_documento = 'anular_manifiesto' AND c.estado = 'enviado'
SET m.estado_rndc = 'anulado', m.anulacion_rndc_id = c.rndc_ingreso_id, m.anulado_at = NOW()
WHERE m.estado_rndc IN ('aceptado', 'anulacion_pendiente');

UPDATE remesa r
  JOIN cola_envios c ON c.referencia_id = r.id
    AND c.tipo_documento = 'anular_remesa' AND c.estado = 'enviado'
SET r.estado_rndc = 'anulado', r.anulacion_rndc_id = c.rndc_ingreso_id, r.anulado_at = NOW()
WHERE r.estado_rndc IN ('aceptado', 'anulacion_pendiente');
