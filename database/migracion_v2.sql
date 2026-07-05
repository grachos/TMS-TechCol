-- ==========================================================
--  Light TMS - Migración v2: campos para un despacho RNDC completo.
--  Importar DESPUÉS de schema.sql (idempotente: ADD ... IF NOT EXISTS).
-- ==========================================================

SET NAMES utf8mb4;

-- ---------- Solicitud de Servicio ----------
ALTER TABLE solicitud_servicio
    ADD COLUMN IF NOT EXISTS tipo_viaje                 VARCHAR(20)   NULL  COMMENT 'Nacional/...',
    ADD COLUMN IF NOT EXISTS sube_rndc                  TINYINT(1)    NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS propietario_carga_tipo_id  VARCHAR(2)    NULL  COMMENT '[TIPOIDPROPIETARIO] remesa',
    ADD COLUMN IF NOT EXISTS propietario_carga_num_id   VARCHAR(15)   NULL  COMMENT '[NUMIDPROPIETARIO] remesa',
    ADD COLUMN IF NOT EXISTS titular_tipo_id            VARCHAR(2)    NULL  COMMENT '[CODIDTITULARMANIFIESTO]',
    ADD COLUMN IF NOT EXISTS titular_num_id             VARCHAR(15)   NULL  COMMENT '[NUMIDTITULARMANIFIESTO]',
    ADD COLUMN IF NOT EXISTS tipo_empaque               VARCHAR(6)    NULL  COMMENT '[TIPOEMPAQUE]',
    ADD COLUMN IF NOT EXISTS mercancia_codigo           VARCHAR(10)   NULL  COMMENT '[MERCANCIAREMESA]',
    ADD COLUMN IF NOT EXISTS peso                       DECIMAL(14,3) NULL,
    ADD COLUMN IF NOT EXISTS valor_mercancia            DECIMAL(14,2) NULL,
    ADD COLUMN IF NOT EXISTS municipio_pago_saldo       VARCHAR(8)    NULL  COMMENT '[CODMUNICIPIOPAGOSALDO]',
    ADD COLUMN IF NOT EXISTS fecha_cita_cargue          DATE          NULL  COMMENT '[FECHACITACARGUE]',
    ADD COLUMN IF NOT EXISTS hora_cita_cargue           VARCHAR(5)    NULL  COMMENT '[HORACITACARGUE]',
    ADD COLUMN IF NOT EXISTS fecha_cita_descargue       DATE          NULL  COMMENT '[FECHACITADESCARGUE]',
    ADD COLUMN IF NOT EXISTS hora_cita_descargue        VARCHAR(5)    NULL  COMMENT '[HORACITADESCARGUE]',
    ADD COLUMN IF NOT EXISTS horas_pacto_descargue      INT           NULL  COMMENT '[REMHORASPACTODESCARGA]',
    ADD COLUMN IF NOT EXISTS minutos_pacto_descargue    INT           NULL  COMMENT '[REMMINUTOSPACTODESCARGA]',
    ADD COLUMN IF NOT EXISTS direccion_cargue           VARCHAR(120)  NULL,
    ADD COLUMN IF NOT EXISTS direccion_descargue        VARCHAR(120)  NULL,
    ADD COLUMN IF NOT EXISTS responsable_pago_cargue    VARCHAR(1)    NULL  COMMENT '[RESPONSABLEPAGOCARGUE] E/D/R',
    ADD COLUMN IF NOT EXISTS responsable_pago_descargue VARCHAR(1)    NULL  COMMENT '[RESPONSABLEPAGODESCARGUE]',
    ADD COLUMN IF NOT EXISTS retencion_ica              DECIMAL(8,2)  NULL  COMMENT '[RETENCIONICAMANIFIESTOCARGA]',
    ADD COLUMN IF NOT EXISTS tipo_flete                 VARCHAR(2)    NULL,
    ADD COLUMN IF NOT EXISTS fecha_pago_saldo           DATE          NULL  COMMENT '[FECHAPAGOSALDOMANIFIESTO]',
    ADD COLUMN IF NOT EXISTS nro_poliza                 VARCHAR(20)   NULL  COMMENT '[MANNROPOLIZA]/[REMPOLIZA]';

-- ---------- Remesa ----------
ALTER TABLE remesa
    ADD COLUMN IF NOT EXISTS mercancia_codigo        VARCHAR(10) NULL COMMENT '[MERCANCIAREMESA]',
    ADD COLUMN IF NOT EXISTS propietario_tipo_id     VARCHAR(2)  NULL COMMENT '[TIPOIDPROPIETARIO]',
    ADD COLUMN IF NOT EXISTS propietario_num_id      VARCHAR(15) NULL COMMENT '[NUMIDPROPIETARIO]',
    ADD COLUMN IF NOT EXISTS hora_cita_cargue        VARCHAR(5)  NULL COMMENT '[HORACITACARGUE]',
    ADD COLUMN IF NOT EXISTS fecha_cita_descargue    DATE        NULL COMMENT '[FECHACITADESCARGUE]',
    ADD COLUMN IF NOT EXISTS hora_cita_descargue     VARCHAR(5)  NULL COMMENT '[HORACITADESCARGUE]',
    ADD COLUMN IF NOT EXISTS horas_pacto_descargue   INT         NULL COMMENT '[REMHORASPACTODESCARGA]',
    ADD COLUMN IF NOT EXISTS minutos_pacto_descargue INT         NULL COMMENT '[REMMINUTOSPACTODESCARGA]';

-- ---------- Manifiesto ----------
ALTER TABLE manifiesto
    ADD COLUMN IF NOT EXISTS responsable_pago_cargue    VARCHAR(1)  NULL COMMENT '[RESPONSABLEPAGOCARGUE]',
    ADD COLUMN IF NOT EXISTS responsable_pago_descargue VARCHAR(1)  NULL COMMENT '[RESPONSABLEPAGODESCARGUE]',
    ADD COLUMN IF NOT EXISTS nro_poliza                 VARCHAR(20) NULL COMMENT '[MANNROPOLIZA]';
