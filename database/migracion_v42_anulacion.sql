-- migracion_v42_anulacion.sql
-- Anulación de despachos ante el RNDC (procesos 9/28/29/32, y 54 reactivo).
--
-- Máquina de estados (estado_rndc es VARCHAR, no hace falta cambiar enum):
--   remesa/manifiesto.estado_rndc:        aceptado -> anulacion_pendiente -> anulado
--   remesa/manifiesto.cumplido_estado_rndc: aceptado -> (anular cumplido) -> pendiente
--     (al anular el cumplido vuelve a 'pendiente' para poder re-cumplir y reenviar)
--
-- Columnas de auditoría/motivo de la anulación del documento base (procs 32/9).
-- Los números de aceptación RNDC de los pasos intermedios (anular cumplido, etc.)
-- quedan visibles en cola_envios.rndc_ingreso_id (monitor de la página Cola).

ALTER TABLE manifiesto
  ADD COLUMN IF NOT EXISTS anulacion_motivo        VARCHAR(1)   NULL COMMENT 'D=digitación S=cancelación R=cambio remesas',
  ADD COLUMN IF NOT EXISTS anulacion_observaciones VARCHAR(255) NULL,
  ADD COLUMN IF NOT EXISTS anulacion_rndc_id       VARCHAR(40)  NULL COMMENT 'ingreso RNDC de la anulación (proc 32)',
  ADD COLUMN IF NOT EXISTS anulado_por             BIGINT UNSIGNED NULL COMMENT 'staff_users.id (auditoría, sin FK)',
  ADD COLUMN IF NOT EXISTS anulado_at              DATETIME     NULL;

ALTER TABLE remesa
  ADD COLUMN IF NOT EXISTS anulacion_motivo        VARCHAR(1)   NULL COMMENT 'D=digitación S=cancelación',
  ADD COLUMN IF NOT EXISTS anulacion_observaciones VARCHAR(255) NULL,
  ADD COLUMN IF NOT EXISTS anulacion_rndc_id       VARCHAR(40)  NULL COMMENT 'ingreso RNDC de la anulación (proc 9)',
  ADD COLUMN IF NOT EXISTS anulado_por             BIGINT UNSIGNED NULL COMMENT 'staff_users.id (auditoría, sin FK)',
  ADD COLUMN IF NOT EXISTS anulado_at              DATETIME     NULL;
