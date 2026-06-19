-- ==========================================================
--  Light TMS - Maestros: Tercero (proceso 11) y Vehículo (proceso 12)
--  Espejo local de los maestros del RNDC. Remesa/Manifiesto solo
--  referencian su identificación; el RNDC hereda el resto.
--  Importar en phpMyAdmin después de schema.sql.
-- ==========================================================

SET NAMES utf8mb4;

-- ----------------------------------------------------------
--  TERCERO  [proceso 11]
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS tercero (
    id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,

    -- Identificación (obligatorios)
    tipo_id             VARCHAR(2)   NOT NULL COMMENT '[CODTIPOIDTERCERO]',
    num_id              VARCHAR(15)  NOT NULL COMMENT '[NUMIDTERCERO]',
    nombre              VARCHAR(100) NOT NULL COMMENT '[NOMIDTERCERO] razón social o nombres',
    primer_apellido     VARCHAR(100) NULL     COMMENT '[PRIMERAPELLIDOIDTERCERO]',
    segundo_apellido    VARCHAR(100) NULL     COMMENT '[SEGUNDOAPELLIDOIDTERCERO]',
    regimen_simple      VARCHAR(1)   NULL     COMMENT '[REGIMENSIMPLE] S/N',

    -- Ubicación (obligatorios)
    direccion           VARCHAR(120) NOT NULL COMMENT '[NOMENCLATURADIRECCION]',
    cod_municipio       VARCHAR(8)   NOT NULL COMMENT '[CODMUNICIPIORNDC] DIVIPOLA',
    municipio_nombre    VARCHAR(120) NULL     COMMENT '[MUNICIPIORNDC] para mostrar',
    sede                VARCHAR(6)   NULL     COMMENT '[CODSEDETERCERO]',
    nombre_sede         VARCHAR(40)  NULL     COMMENT '[NOMSEDETERCERO]',
    telefono            VARCHAR(10)  NULL     COMMENT '[NUMTELEFONOCONTACTO]',
    celular             VARCHAR(10)  NULL     COMMENT '[NUMCELULARPERSONA]',
    email               VARCHAR(120) NULL,
    latitud             DECIMAL(13,8) NULL    COMMENT '[LATITUD]',
    longitud            DECIMAL(13,8) NULL    COMMENT '[LONGITUD]',

    -- Datos de conductor (solo si es conductor)
    es_conductor        TINYINT(1)   NOT NULL DEFAULT 0,
    categoria_licencia  VARCHAR(3)   NULL     COMMENT '[NOMCATEGORIALICENCIACONDUCCION]',
    num_licencia        VARCHAR(20)  NULL     COMMENT '[NUMLICENCIACONDUCCION]',
    fecha_venc_licencia DATE         NULL     COMMENT '[FECHAVENCIMIENTOLICENCIA]',

    -- Resultado RNDC
    rndc_ingreso_id     VARCHAR(40)  NULL,
    estado_rndc         ENUM('borrador','pendiente','registrado','error') NOT NULL DEFAULT 'borrador',
    rndc_error          TEXT NULL,

    created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    UNIQUE KEY uq_tercero (tipo_id, num_id),
    KEY idx_tercero_nombre (nombre)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------
--  VEHÍCULO  [proceso 12]
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS vehiculo (
    id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,

    -- Obligatorios
    placa               VARCHAR(6)   NOT NULL COMMENT '[NUMPLACA]',
    cod_configuracion   VARCHAR(2)   NOT NULL COMMENT '[CODCONFIGURACIONUNIDADCARGA]',
    peso_vacio          INT          NULL     COMMENT '[PESOVEHICULOVACIO] kg',

    -- Tenedor (obligatorio). Propietario opcional: el RNDC lo hereda del RUNT.
    propietario_tipo_id VARCHAR(2)   NULL     COMMENT '[CODTIPOIDPROPIETARIO]',
    propietario_num_id  VARCHAR(15)  NULL     COMMENT '[NUMIDPROPIETARIO]',
    tenedor_tipo_id     VARCHAR(2)   NOT NULL COMMENT '[CODTIPOIDTENEDOR]',
    tenedor_num_id      VARCHAR(15)  NOT NULL COMMENT '[NUMIDTENEDOR]',

    -- Remolque (otro vehículo)
    remolque_placa      VARCHAR(6)   NULL     COMMENT 'Placa remolque [NUMPLACAREMOLQUE]',

    -- Resultado RNDC
    rndc_ingreso_id     VARCHAR(40)  NULL,
    estado_rndc         ENUM('borrador','pendiente','registrado','error') NOT NULL DEFAULT 'borrador',
    rndc_error          TEXT NULL,

    created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    UNIQUE KEY uq_vehiculo (placa),
    KEY idx_vehiculo_placa (placa)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
