-- v16: Renombrar titular_* → generador_* en solicitud_servicio.
--      Remesa.propietario ahora viene de generador (no propietario_carga).
--      Manifiesto.titular ahora viene del tenedor del vehículo.

ALTER TABLE solicitud_servicio
    CHANGE COLUMN titular_tipo_id  generador_tipo_id VARCHAR(2)   NULL  COMMENT '[CODTIPOIDPROPIETARIO] generador de carga',
    CHANGE COLUMN titular_num_id   generador_num_id  VARCHAR(20)  NULL  COMMENT '[NUMIDPROPIETARIO] generador de carga';
