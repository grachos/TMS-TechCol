-- Light TMS - adds manifiesto.observaciones ([observaciones], RNDC manifiesto XML).
-- Seeded from solicitud_servicio.observaciones when the despacho is confirmed
-- (mirrors fopat/retencion_fuente), editable afterwards via "Editar despacho".

ALTER TABLE manifiesto
    ADD COLUMN IF NOT EXISTS observaciones TEXT NULL COMMENT '[observaciones]' AFTER municipio_pago_saldo;
