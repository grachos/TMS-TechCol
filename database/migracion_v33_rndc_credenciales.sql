-- ==========================================================
--  Light TMS - Migración v33: credenciales RNDC en maestro_empresa.
--
--  Antes vivían en RNDC_USERNAME/RNDC_PASSWORD (.env), fijas por despliegue.
--  Ahora se editan desde el formulario "Empresa" (admin) y se guardan junto
--  al resto de datos de la empresa. RNDC_EMPRESA desaparece por completo: el
--  NIT que se envía al RNDC como NUMNITEMPRESATRANSPORTE es directamente
--  maestro_empresa.nit (el mismo campo "NIT *" del formulario).
-- ==========================================================

SET NAMES utf8mb4;

ALTER TABLE maestro_empresa
    ADD COLUMN IF NOT EXISTS rndc_username VARCHAR(60)  NULL AFTER nit,
    ADD COLUMN IF NOT EXISTS rndc_password VARCHAR(120) NULL AFTER rndc_username;
