-- Light TMS - adds manifiesto.seguridadqr_error.
--
-- consultarSeguridadQr() fetches the manifiesto's RNDC security QR code
-- (SEGURIDADOR) right after acceptance. It used to fail silently (console.error
-- only) on any issue — a blank NIT config, RNDC's consultas server lagging
-- behind the expedir server, a network hiccup — leaving seguridadqr NULL
-- forever with no way to notice or retry. This column surfaces the failure
-- reason so it can be shown in the UI and the lookup retried on demand.

ALTER TABLE manifiesto
    ADD COLUMN IF NOT EXISTS seguridadqr_error VARCHAR(255) NULL COMMENT 'Motivo si consultarSeguridadQr falló' AFTER seguridadqr;
