-- ==========================================================
--  Light TMS - Migración v3: maestro de empresa + retenciones + tipos.
--  Importar después de migracion_v2.sql (idempotente).
-- ==========================================================

SET NAMES utf8mb4;

-- ---------- Maestro de la empresa (datos propios, una sola fila) ----------
CREATE TABLE IF NOT EXISTS maestro_empresa (
    id           INT NOT NULL,
    tipo_id      VARCHAR(2)   NOT NULL DEFAULT 'N',
    nit          VARCHAR(20)  NOT NULL,
    razon_social VARCHAR(150) NULL,
    nro_poliza   VARCHAR(20)  NULL COMMENT '[MANNROPOLIZA]/[REMPOLIZA]',
    updated_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO maestro_empresa (id, tipo_id, nit, razon_social, nro_poliza)
VALUES (1, 'N', '8190041165', 'ELOGIA SOLUCIONES LOGISTICAS S.A.S', NULL)
ON DUPLICATE KEY UPDATE id = id;

-- ---------- Solicitud: retenciones calculadas + tipo valor pactado ----------
ALTER TABLE solicitud_servicio
    ADD COLUMN IF NOT EXISTS porcentaje_ica     DECIMAL(5,2)  NULL COMMENT 'Tarifa ICA (%) para calcular la retención',
    ADD COLUMN IF NOT EXISTS retencion_fuente   DECIMAL(14,2) NULL COMMENT '[RETENCIONFUENTEMANIFIESTO] 1% del flete',
    ADD COLUMN IF NOT EXISTS fopat              DECIMAL(14,2) NULL COMMENT 'FOPAT 0.1% del flete',
    ADD COLUMN IF NOT EXISTS tipo_valor_pactado VARCHAR(1)    NULL COMMENT '[TIPOVALORPACTADO] V/K/G';

-- ---------- Manifiesto: FOPAT + tipo valor pactado ----------
ALTER TABLE manifiesto
    ADD COLUMN IF NOT EXISTS fopat              DECIMAL(14,2) NULL,
    ADD COLUMN IF NOT EXISTS tipo_valor_pactado VARCHAR(1)    NULL COMMENT '[TIPOVALORPACTADO]';
