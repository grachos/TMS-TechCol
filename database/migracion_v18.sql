-- v18: Agregar peso a la tabla remesa.

ALTER TABLE remesa
    ADD COLUMN IF NOT EXISTS peso DECIMAL(14,3) NULL COMMENT '[PESOREMESA]' AFTER unidad_medida;
