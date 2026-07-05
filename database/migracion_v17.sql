-- v17: Eliminar columnas innecesarias de solicitud_servicio.
--      empresa_tipo_id / empresa_num_id no se usan en la lógica de negocio.
--      placa_vehiculo, conductor_*, valor_anticipo se conservan (usa CAMPOS_DESPACHO).

ALTER TABLE solicitud_servicio
    DROP COLUMN IF EXISTS empresa_tipo_id,
    DROP COLUMN IF EXISTS empresa_num_id;
