-- migracion_v44_estado_rndc_anulacion.sql
--
-- MISMO problema que v37 (cumplido) y v43 (anulación en cola_envios), esta vez
-- en las columnas más importantes de todas: manifiesto.estado_rndc y
-- remesa.estado_rndc son ENUM('pendiente','enviado','aceptado','rechazado') y
-- NUNCA se ampliaron con 'anulacion_pendiente'/'anulado'. Desde la Fase 1 de
-- anulación, cada UPDATE ... SET estado_rndc = 'anulacion_pendiente' | 'anulado'
-- se guardó en silencio como '' en un MySQL no-estricto — es la causa del
-- círculo vacío en la columna RNDC de Despachos.

ALTER TABLE manifiesto
    MODIFY COLUMN estado_rndc ENUM('pendiente','enviado','aceptado','rechazado','anulacion_pendiente','anulado') NOT NULL DEFAULT 'pendiente';

ALTER TABLE remesa
    MODIFY COLUMN estado_rndc ENUM('pendiente','enviado','aceptado','rechazado','anulacion_pendiente','anulado') NOT NULL DEFAULT 'pendiente';

-- Repara filas corrompidas a '' infiriendo el estado real a partir de las
-- columnas de auditoría que sí se guardaron bien (no son ENUM):
--   anulacion_rndc_id IS NOT NULL  -> el RNDC ya confirmó la anulación -> 'anulado'
--   anulacion_motivo  IS NOT NULL  -> se encoló la anulación pero aún no confirma -> 'anulacion_pendiente'
UPDATE manifiesto
   SET estado_rndc = 'anulado'
 WHERE estado_rndc = '' AND anulacion_rndc_id IS NOT NULL;
UPDATE manifiesto
   SET estado_rndc = 'anulacion_pendiente'
 WHERE estado_rndc = '' AND anulacion_rndc_id IS NULL AND anulacion_motivo IS NOT NULL;

UPDATE remesa
   SET estado_rndc = 'anulado'
 WHERE estado_rndc = '' AND anulacion_rndc_id IS NOT NULL;
UPDATE remesa
   SET estado_rndc = 'anulacion_pendiente'
 WHERE estado_rndc = '' AND anulacion_rndc_id IS NULL AND anulacion_motivo IS NOT NULL;
