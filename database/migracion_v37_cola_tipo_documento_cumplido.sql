-- Light TMS - adds cumplido_remesa/cumplido_manifiesto to cola_envios.tipo_documento.
--
-- The original ENUM only listed remesa/manifiesto/tercero/vehiculo, but
-- encolarCumplido() has always inserted rows with tipo_documento =
-- 'cumplido_remesa' / 'cumplido_manifiesto'. On a non-strict MySQL server
-- an invalid ENUM value is silently stored as '' instead of erroring — so
-- every cumplido queue row's tipo_documento came out blank, which is why
-- "Categoría" and "Documento" show up empty in Cola de envíos for them.

ALTER TABLE cola_envios
    MODIFY COLUMN tipo_documento ENUM('remesa','manifiesto','tercero','vehiculo','cumplido_remesa','cumplido_manifiesto') NOT NULL;

-- Repair rows already corrupted to '' — proceso_rndc was computed correctly
-- at insert time regardless of the enum truncation, so it reliably tells
-- cumplido_remesa (5) apart from cumplido_manifiesto (6).
UPDATE cola_envios SET tipo_documento = 'cumplido_remesa' WHERE tipo_documento = '' AND proceso_rndc = 5;
UPDATE cola_envios SET tipo_documento = 'cumplido_manifiesto' WHERE tipo_documento = '' AND proceso_rndc = 6;
