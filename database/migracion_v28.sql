-- migracion_v28.sql
-- De 1:1 a 1:N entre manifiesto y remesa (varios productos por viaje)

CREATE TABLE IF NOT EXISTS manifiesto_remesa (
    manifiesto_id BIGINT UNSIGNED NOT NULL,
    remesa_id     BIGINT UNSIGNED NOT NULL,
    PRIMARY KEY (manifiesto_id, remesa_id),
    KEY idx_mr_remesa (remesa_id),
    CONSTRAINT fk_mr_manifiesto FOREIGN KEY (manifiesto_id)
        REFERENCES manifiesto (id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_mr_remesa FOREIGN KEY (remesa_id)
        REFERENCES remesa (id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE remesa ADD COLUMN IF NOT EXISTS valor_mercancia DECIMAL(14,2) NULL AFTER peso;

ALTER TABLE cola_envios ADD COLUMN IF NOT EXISTS manifiesto_id BIGINT UNSIGNED NULL AFTER solicitud_id;
ALTER TABLE cola_envios ADD KEY idx_cola_manifiesto (manifiesto_id);
