-- ==========================================================
--  Light TMS - Migración v7: cola de envíos ligada a la solicitud.
--  Importar después de migracion_v6.sql (idempotente).
--
--  La Fase 4 (store-and-forward) agrupa los documentos a enviar por
--  solicitud y los drena en orden: tercero(11) → vehículo(12) →
--  remesa(3) → manifiesto(4). Necesitamos saber a qué solicitud
--  pertenece cada fila de la cola para respetar ese orden y marcar
--  la solicitud como 'despachada' al aceptarse su manifiesto.
-- ==========================================================

SET NAMES utf8mb4;

ALTER TABLE cola_envios
    ADD COLUMN IF NOT EXISTS solicitud_id BIGINT UNSIGNED NULL
        COMMENT 'solicitud que originó el envío (para ordenar y cerrar el despacho)'
        AFTER id;

ALTER TABLE cola_envios
    ADD KEY IF NOT EXISTS idx_cola_solicitud (solicitud_id, orden);
