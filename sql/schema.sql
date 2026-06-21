-- ==========================================================
--  Light TMS - Esquema de base de datos (MariaDB / MySQL)
--  Importar desde phpMyAdmin en la base de datos del proyecto.
--
--  Modelo:
--    solicitud_servicio  -> captura única que siembra Manifiesto + Remesa
--    manifiesto          -> documento RNDC generado desde la solicitud
--    remesa              -> documento RNDC generado desde la solicitud
--    cola_envios         -> bandeja store-and-forward hacia el RNDC
--
--  Convención: los nombres alineados con el RNDC se anotan en comentarios
--  con su variable oficial entre [corchetes] para facilitar el mapeo XML.
-- ==========================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ----------------------------------------------------------
--  SOLICITUD DE SERVICIO
--  Pantalla inicial. Se captura UNA vez y siembra los demás
--  documentos. El usuario no crea manifiesto/remesa por separado.
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS solicitud_servicio (
    id                   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    consecutivo          VARCHAR(30)  NULL COMMENT 'Número interno de la empresa',
    fecha_solicitud      DATE         NOT NULL,

    -- Operación y ruta
    operacion_transporte VARCHAR(2)   NULL  COMMENT '[CODOPERACIONTRANSPORTE]',
    municipio_origen     VARCHAR(8)   NULL  COMMENT '[CODMUNICIPIOORIGEN] DIVIPOLA',
    municipio_destino    VARCHAR(8)   NULL  COMMENT '[CODMUNICIPIODESTINO] DIVIPOLA',

    -- Vehículo y conductor
    placa_vehiculo       VARCHAR(10)  NULL  COMMENT '[NUMPLACA]',
    conductor_tipo_id    VARCHAR(2)   NULL  COMMENT '[CODTIPOIDCONDUCTOR]',
    conductor_num_id     VARCHAR(20)  NULL  COMMENT '[CODIDCONDUCTOR]',

    -- Remitente / destinatario
    remitente_tipo_id    VARCHAR(2)   NULL  COMMENT '[CODTIPOIDREMITENTE]',
    remitente_num_id     VARCHAR(20)  NULL  COMMENT '[NUMIDREMITENTE]',
    destinatario_tipo_id VARCHAR(2)   NULL  COMMENT '[CODTIPOIDDESTINATARIO]',
    destinatario_num_id  VARCHAR(20)  NULL  COMMENT '[NUMIDDESTINATARIO]',

    -- Carga
    naturaleza_carga     VARCHAR(2)   NULL  COMMENT '[CODNATURALEZACARGA]',
    descripcion_producto VARCHAR(250) NULL  COMMENT '[DESCRIPCIONCORTAPRODUCTO]',
    cantidad_vehiculos     INT NOT NULL DEFAULT 1 COMMENT 'Vehículos/dispachos restantes',
    unidad_medida        VARCHAR(2)   NULL  COMMENT '[CODUNIDADMEDIDACAPACIDAD]',

    -- Valores
    valor_flete          DECIMAL(14,2) NULL COMMENT '[VALORFLETEPACTADOVIAJE]',

    estado               ENUM('borrador','procesada','despachada','anulada') NOT NULL DEFAULT 'borrador',
    observaciones        TEXT NULL,

    created_at           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    KEY idx_solicitud_estado (estado),
    KEY idx_solicitud_fecha  (fecha_solicitud)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------
--  MANIFIESTO DE CARGA  [proceso RNDC: ManifiestoCarga]
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS manifiesto (
    id                     BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    solicitud_id           BIGINT UNSIGNED NOT NULL,

    num_manifiesto         VARCHAR(30)  NULL COMMENT '[NUMMANIFIESTOCARGA] consecutivo propio',
    fecha_expedicion       DATE         NULL COMMENT '[FECHAEXPEDICIONMANIFIESTO]',
    operacion_transporte   VARCHAR(2)   NULL COMMENT '[CODOPERACIONTRANSPORTE]',
    municipio_origen       VARCHAR(8)   NULL COMMENT '[CODMUNICIPIOORIGENMANIFIESTO]',
    municipio_destino      VARCHAR(8)   NULL COMMENT '[CODMUNICIPIODESTINOMANIFIESTO]',

    titular_tipo_id        VARCHAR(2)   NULL COMMENT '[CODTIPOIDTITULARMANIFIESTO]',
    titular_num_id         VARCHAR(20)  NULL COMMENT '[CODIDTITULARMANIFIESTO]',
    placa_vehiculo         VARCHAR(10)  NULL COMMENT '[NUMPLACA]',
    conductor_tipo_id      VARCHAR(2)   NULL COMMENT '[CODTIPOIDCONDUCTOR]',
    conductor_num_id       VARCHAR(20)  NULL COMMENT '[CODIDCONDUCTOR]',

    valor_flete_pactado    DECIMAL(14,2) NULL COMMENT '[VALORFLETEPACTADOVIAJE]',
    valor_anticipo         DECIMAL(14,2) NULL COMMENT '[VALORANTICIPOMANIFIESTO]',
    retencion_fuente       DECIMAL(14,2) NULL COMMENT '[RETENCIONFUENTEMANIFIESTO]',
    retencion_ica          DECIMAL(14,2) NULL COMMENT '[RETENCIONICAMANIFIESTO]',
    fecha_pago_saldo       DATE         NULL COMMENT '[FECHAPAGOSALDOMANIFIESTO]',
    municipio_pago_saldo   VARCHAR(8)   NULL COMMENT '[CODMUNICIPIOPAGOSALDO]',

    -- Resultado del RNDC
    rndc_ingreso_id        VARCHAR(40)  NULL COMMENT 'ingresoid devuelto por el RNDC',
    estado_rndc            ENUM('pendiente','enviado','aceptado','rechazado') NOT NULL DEFAULT 'pendiente',

    created_at             DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at             DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    KEY idx_manifiesto_solicitud (solicitud_id),
    KEY idx_manifiesto_estado    (estado_rndc),
    CONSTRAINT fk_manifiesto_solicitud FOREIGN KEY (solicitud_id)
        REFERENCES solicitud_servicio (id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------
--  REMESA TERRESTRE DE CARGA  [proceso RNDC: RemesaTerrestreCarga]
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS remesa (
    id                     BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    solicitud_id           BIGINT UNSIGNED NOT NULL,

    num_remesa             VARCHAR(30)  NULL COMMENT '[NUMREMESA] consecutivo propio',
    operacion_transporte   VARCHAR(2)   NULL COMMENT '[CODOPERACIONTRANSPORTE]',
    naturaleza_carga       VARCHAR(2)   NULL COMMENT '[CODNATURALEZACARGA]',
    tipo_empaque           VARCHAR(2)   NULL COMMENT '[CODTIPOEMPAQUE]',
    descripcion_producto   VARCHAR(250) NULL COMMENT '[DESCRIPCIONCORTAPRODUCTO]',
    cantidad_cargada       DECIMAL(14,3) NULL COMMENT '[CANTIDADCARGADA]',
    unidad_medida          VARCHAR(2)   NULL COMMENT '[CODUNIDADMEDIDACAPACIDAD]',
    peso                   DECIMAL(14,3) NULL COMMENT '[PESOREMESA]',

    remitente_tipo_id      VARCHAR(2)   NULL COMMENT '[CODTIPOIDREMITENTE]',
    remitente_num_id       VARCHAR(20)  NULL COMMENT '[NUMIDREMITENTE]',
    sede_remitente         VARCHAR(20)  NULL COMMENT '[CODSEDEREMITENTE]',
    destinatario_tipo_id   VARCHAR(2)   NULL COMMENT '[CODTIPOIDDESTINATARIO]',
    destinatario_num_id    VARCHAR(20)  NULL COMMENT '[NUMIDDESTINATARIO]',
    sede_destinatario      VARCHAR(20)  NULL COMMENT '[CODSEDEDESTINATARIO]',

    municipio_cargue       VARCHAR(8)   NULL COMMENT '[CODMUNICIPIOORIGEN]',
    municipio_descargue    VARCHAR(8)   NULL COMMENT '[CODMUNICIPIODESTINO]',
    fecha_cita_cargue      DATETIME     NULL COMMENT '[FECHACITAPACTADACARGUE]',

    -- Resultado del RNDC
    rndc_ingreso_id        VARCHAR(40)  NULL COMMENT 'ingresoid devuelto por el RNDC',
    estado_rndc            ENUM('pendiente','enviado','aceptado','rechazado') NOT NULL DEFAULT 'pendiente',

    created_at             DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at             DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    KEY idx_remesa_solicitud (solicitud_id),
    KEY idx_remesa_estado    (estado_rndc),
    CONSTRAINT fk_remesa_solicitud FOREIGN KEY (solicitud_id)
        REFERENCES solicitud_servicio (id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------
--  COLA DE ENVÍOS (store-and-forward)
--  Cada fila es un documento a enviar al RNDC. El worker de cron
--  drena las filas "pendiente" cuando el web service está disponible.
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS cola_envios (
    id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,

    tipo_documento    ENUM('remesa','manifiesto','tercero','vehiculo') NOT NULL,
    referencia_id     BIGINT UNSIGNED NULL COMMENT 'id en su tabla (manifiesto/remesa)',
    proceso_rndc      INT UNSIGNED NULL COMMENT 'número de proceso <solicitud> del RNDC (ver config)',
    orden             INT NOT NULL DEFAULT 0 COMMENT 'secuencia de envío (terceros < remesa < manifiesto)',

    payload_xml       MEDIUMTEXT NOT NULL COMMENT 'XML completo a enviar',
    estado            ENUM('pendiente','enviando','enviado','error') NOT NULL DEFAULT 'pendiente',

    intentos          INT NOT NULL DEFAULT 0,
    max_intentos      INT NOT NULL DEFAULT 10,
    programado_para   DATETIME NULL COMMENT 'no reintentar antes de esta fecha/hora',

    rndc_ingreso_id   VARCHAR(40) NULL,
    respuesta_rndc    MEDIUMTEXT NULL COMMENT 'XML/respuesta cruda del RNDC',
    ultimo_error      TEXT NULL,

    created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    enviado_at        DATETIME NULL,

    PRIMARY KEY (id),
    KEY idx_cola_estado    (estado, programado_para),
    KEY idx_cola_documento (tipo_documento, referencia_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;
