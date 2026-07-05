-- ==========================================================
--  Light TMS - Migración v31: autenticación de personal (staff).
--
--  NUEVO en la migración a la pila moderna: la app PHP no tenía
--  autenticación. El backend Node expone JWT para el personal;
--  las cuentas viven aquí. Roles: 'admin' | 'operador'.
--  El envío real al RNDC queda restringido al rol 'admin'.
-- ==========================================================

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS staff_users (
    id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    email          VARCHAR(180) NOT NULL,
    password_hash  VARCHAR(255) NOT NULL COMMENT 'bcrypt',
    nombre         VARCHAR(120) NOT NULL,
    rol            ENUM('admin','operador') NOT NULL DEFAULT 'operador',
    activo         TINYINT(1)   NOT NULL DEFAULT 1,

    created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    UNIQUE KEY uq_staff_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
