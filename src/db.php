<?php
/**
 * Light TMS - Conexión a la base de datos (MariaDB / MySQL) vía PDO.
 */

declare(strict_types=1);

require_once __DIR__ . '/config.php';

/**
 * Devuelve una conexión PDO compartida (singleton) a MariaDB.
 *
 * @throws PDOException si la conexión falla.
 */
function db(): PDO
{
    static $pdo = null;
    if ($pdo instanceof PDO) {
        return $pdo;
    }

    $cfg = config()['db'];

    $dsn = sprintf(
        'mysql:host=%s;port=%d;dbname=%s;charset=%s',
        $cfg['host'],
        $cfg['port'],
        $cfg['name'],
        $cfg['charset']
    );

    $opciones = [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES   => false,
    ];

    return $pdo = new PDO($dsn, $cfg['user'], $cfg['pass'], $opciones);
}

/**
 * Indica si la base de datos responde, sin lanzar excepción.
 */
function db_disponible(?string &$error = null): bool
{
    try {
        db()->query('SELECT 1');
        return true;
    } catch (Throwable $e) {
        $error = $e->getMessage();
        return false;
    }
}
