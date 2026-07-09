-- Light TMS - drops vehiculo.peso_vacio_remolque.
--
-- This value duplicated data that belongs to the remolque's OWN vehiculo
-- record (identified via vehiculo.remolque_placa) — its own peso_vacio
-- column. The app now looks up that record instead of asking the user to
-- re-enter the trailer's weight on the tractor's record.

ALTER TABLE vehiculo
    DROP COLUMN IF EXISTS peso_vacio_remolque;
