-- Light TMS - Migración v12: Reestructurar tabla producto con columnas del CSV RNDC.
SET NAMES utf8mb4;

DROP TABLE IF EXISTS producto;

CREATE TABLE producto (
    id INT AUTO_INCREMENT PRIMARY KEY,
    codigo VARCHAR(10) NOT NULL,
    nombre VARCHAR(400) NOT NULL COMMENT '[NOMBREYDESCRIPCION]',
    tipo VARCHAR(4) NULL COMMENT 'CP=carga peligrosa, DP=desecho peligroso, DCRP=desagregacion corriente, 00=general',
    capitulo VARCHAR(200) NULL,
    partida VARCHAR(400) NULL,
    aplica_sicetac VARCHAR(3) NULL,
    necesita_subpartida VARCHAR(3) NULL,
    hidrocarburo VARCHAR(3) NULL,
    unidad_galones VARCHAR(3) NULL,
    impoconsumo VARCHAR(3) NULL,
    peligrosa VARCHAR(3) NULL COMMENT '[MERCANCIAPELIGROSA]',
    clase_division VARCHAR(10) NULL COMMENT '[CLASEDIVISION]',
    peligro_secundario VARCHAR(10) NULL COMMENT '[PELIGROSECUNDARIO]',
    grupo_embalaje VARCHAR(5) NULL COMMENT '[GRUPOEMBALAJEENVASE]',
    alerta VARCHAR(3) NULL,
    fecha_ingreso DATETIME NULL,
    KEY idx_prod_cod (codigo),
    KEY idx_prod_nom (nombre(60))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
