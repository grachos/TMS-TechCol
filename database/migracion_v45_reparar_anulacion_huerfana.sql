-- migracion_v45_reparar_anulacion_huerfana.sql
--
-- Reparación retroactiva (idempotente, se puede correr varias veces sin
-- riesgo). Antes de que existiera revertirAnulacionSiNoQuedaNadaActivo()
-- (commit a022900), cancelar un paso de anulación en Cola NO revertía
-- estado_rndc de 'anulacion_pendiente' a 'aceptado' — así que cualquier
-- manifiesto/remesa cancelado antes de ese fix quedó atascado mostrando
-- "Anulación en curso" para siempre, sin ningún paso activo en cola_envios
-- que lo explique, y sin poder anularse ni cumplirse de nuevo.
--
-- Este script busca exactamente esa condición huérfana (estado_rndc =
-- 'anulacion_pendiente' pero SIN ningún paso de anulación pendiente/error/
-- enviando en cola_envios) y la revierte a 'aceptado', igual que hace ahora
-- el código en caliente al cancelar. Un manifiesto/remesa con un paso
-- todavía activo (p.ej. a medias de una anulación real) NO se toca.

UPDATE manifiesto m
SET m.estado_rndc = 'aceptado',
    m.anulacion_motivo = NULL,
    m.anulacion_observaciones = NULL,
    m.anulado_por = NULL
WHERE m.estado_rndc = 'anulacion_pendiente'
  AND NOT EXISTS (
    SELECT 1 FROM cola_envios c
    WHERE c.manifiesto_id = m.id
      AND c.referencia_id = m.id
      AND c.tipo_documento IN ('anular_cumplido_manifiesto', 'anular_manifiesto')
      AND c.estado IN ('pendiente', 'error', 'enviando')
  );

UPDATE remesa r
SET r.estado_rndc = 'aceptado',
    r.anulacion_motivo = NULL,
    r.anulacion_observaciones = NULL,
    r.anulado_por = NULL
WHERE r.estado_rndc = 'anulacion_pendiente'
  AND NOT EXISTS (
    SELECT 1 FROM cola_envios c
    WHERE c.referencia_id = r.id
      AND c.tipo_documento IN ('anular_cumplido_remesa', 'anular_cumplido_inicial_remesa', 'anular_remesa')
      AND c.estado IN ('pendiente', 'error', 'enviando')
  );
