-- migracion_v29.sql
-- Back-fill cola_envios.manifiesto_id for rows created before migration v28.
-- New encolar() uses manifiesto_id instead of remesa_id for all lookups.

UPDATE cola_envios c
JOIN manifiesto_remesa mr ON mr.remesa_id = c.remesa_id
SET c.manifiesto_id = mr.manifiesto_id
WHERE c.manifiesto_id IS NULL;
