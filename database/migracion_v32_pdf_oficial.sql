-- ==========================================================
--  Light TMS - Migración v32: campos requeridos para reproducir el
--  formato OFICIAL de Manifiesto/Remesa del RNDC (impresión).
--
--  maestro_empresa: dirección/teléfono/municipio de la empresa (encabezado
--  de los PDF) y la póliza de mercancía peligrosa (tabla "Tomador Póliza"
--  de la Remesa). vehiculo: marca, peso vacío del remolque y datos del SOAT
--  (tabla "Información Técnica del Vehículo" del Manifiesto).
-- ==========================================================

SET NAMES utf8mb4;

ALTER TABLE maestro_empresa
    ADD COLUMN IF NOT EXISTS direccion                  VARCHAR(150) NULL AFTER razon_social,
    ADD COLUMN IF NOT EXISTS telefono                   VARCHAR(20)  NULL AFTER direccion,
    ADD COLUMN IF NOT EXISTS cod_municipio               VARCHAR(8)   NULL AFTER telefono,
    ADD COLUMN IF NOT EXISTS municipio_nombre            VARCHAR(120) NULL AFTER cod_municipio,
    ADD COLUMN IF NOT EXISTS aseguradora_carga_nombre    VARCHAR(150) NULL COMMENT 'Aseguradora de mercancía peligrosa (tabla Tomador Póliza)' AFTER nro_poliza,
    ADD COLUMN IF NOT EXISTS aseguradora_carga_nit       VARCHAR(20)  NULL AFTER aseguradora_carga_nombre,
    ADD COLUMN IF NOT EXISTS poliza_carga_numero         VARCHAR(30)  NULL COMMENT 'No. póliza de mercancía peligrosa' AFTER aseguradora_carga_nit,
    ADD COLUMN IF NOT EXISTS poliza_carga_vencimiento    DATE         NULL AFTER poliza_carga_numero;

ALTER TABLE vehiculo
    ADD COLUMN IF NOT EXISTS marca                 VARCHAR(40)  NULL AFTER cod_configuracion,
    ADD COLUMN IF NOT EXISTS peso_vacio_remolque    INT          NULL COMMENT 'kg, remolque' AFTER peso_vacio,
    ADD COLUMN IF NOT EXISTS soat_compania          VARCHAR(150) NULL COMMENT 'Compañía seguros SOAT' AFTER remolque_placa,
    ADD COLUMN IF NOT EXISTS soat_poliza            VARCHAR(30)  NULL AFTER soat_compania,
    ADD COLUMN IF NOT EXISTS soat_vencimiento        DATE         NULL AFTER soat_poliza;
