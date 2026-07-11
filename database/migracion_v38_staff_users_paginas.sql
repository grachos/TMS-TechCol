-- Light TMS - per-page permissions for staff users.
--
-- rol ('admin'|'operador') already gates real RNDC sending. This adds finer
-- granularity: which pages/modules an 'operador' can see and use, assigned
-- by an admin from the new Usuarios module. NULL means "all pages" so
-- existing accounts keep working exactly as before until an admin explicitly
-- restricts one. 'admin' always has full access regardless of this column.

ALTER TABLE staff_users
    ADD COLUMN IF NOT EXISTS paginas JSON NULL COMMENT 'Páginas permitidas (operador); NULL = todas' AFTER rol;
