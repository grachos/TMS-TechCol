-- ==========================================================
--  Light TMS - Migración v8: campos para tiempo pactado cargue.
--  Importar DESPUÉS de migracion_v7.sql (idempotente: ADD ... IF NOT EXISTS).
-- ==========================================================

SET NAMES utf8mb4;

-- ---------- Solicitud de Servicio ----------
ALTER TABLE solicitud_servicio
    ADD COLUMN IF NOT EXISTS horas_pacto_cargue      INT           NULL  COMMENT '[REMHORASPACTOCARGA]',
    ADD COLUMN IF NOT EXISTS minutos_pacto_cargue    INT           NULL  COMMENT '[REMMINUTOSPACTOCARGA]' AFTER horas_pacto_cargue;

-- ---------- Remesa ----------
ALTER TABLE remesa
    ADD COLUMN IF NOT EXISTS horas_pacto_cargue      INT           NULL  COMMENT '[REMHORASPACTOCARGA]',
    ADD COLUMN IF NOT EXISTS minutos_pacto_cargue    INT           NULL  COMMENT '[REMMINUTOSPACTOCARGA]' AFTER horas_pacto_cargue;
