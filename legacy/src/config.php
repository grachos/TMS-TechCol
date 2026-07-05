<?php
/**
 * Light TMS - Carga de configuración.
 *
 * Lee el archivo .env (sin dependencias externas) y expone helpers
 * env() y config(). No requiere Composer: se sube por FTP y funciona.
 */

declare(strict_types=1);

/**
 * Carga las variables del archivo .env a $_ENV una sola vez.
 */
function cargar_env(string $rutaEnv): void
{
    static $cargado = false;
    if ($cargado) {
        return;
    }
    $cargado = true;

    if (!is_file($rutaEnv)) {
        return; // En producción puede definirse por variables del servidor.
    }

    $lineas = file($rutaEnv, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    foreach ($lineas as $linea) {
        $linea = trim($linea);
        if ($linea === '' || str_starts_with($linea, '#')) {
            continue;
        }
        if (!str_contains($linea, '=')) {
            continue;
        }
        [$clave, $valor] = explode('=', $linea, 2);
        $clave  = trim($clave);
        $valor  = trim($valor);

        // Quita comillas envolventes.
        if (strlen($valor) >= 2) {
            $primero = $valor[0];
            $ultimo  = $valor[strlen($valor) - 1];
            if (($primero === '"' && $ultimo === '"') || ($primero === "'" && $ultimo === "'")) {
                $valor = substr($valor, 1, -1);
            }
        }

        // Quita comentario al final de la línea (solo si no está entre comillas).
        if (($pos = strpos($valor, ' #')) !== false) {
            $valor = rtrim(substr($valor, 0, $pos));
        }

        $_ENV[$clave] = $valor;
        putenv("$clave=$valor");
    }
}

/**
 * Obtiene una variable de entorno con valor por defecto y casteo básico.
 */
function env(string $clave, mixed $defecto = null): mixed
{
    $valor = $_ENV[$clave] ?? getenv($clave);
    if ($valor === false || $valor === null || $valor === '') {
        return $defecto;
    }
    return match (strtolower((string) $valor)) {
        'true'  => true,
        'false' => false,
        'null'  => null,
        default => $valor,
    };
}

cargar_env(__DIR__ . '/../.env');

/**
 * Configuración consolidada de la aplicación.
 */
function config(): array
{
    static $config = null;
    if ($config !== null) {
        return $config;
    }

    return $config = [
        'app' => [
            'name'  => env('APP_NAME', 'Light TMS'),
            'env'   => env('APP_ENV', 'local'),
            'debug' => (bool) env('APP_DEBUG', false),
        ],
        'db' => [
            'host'    => env('DB_HOST', 'localhost'),
            'port'    => (int) env('DB_PORT', 3306),
            'name'    => env('DB_NAME', 'light_tms'),
            'user'    => env('DB_USER', 'root'),
            'pass'    => (string) env('DB_PASS', ''),
            'charset' => env('DB_CHARSET', 'utf8mb4'),
        ],
        'rndc' => [
            // 'pruebas' (servidor rndc) o 'produccion' (rndcws/rndcws2/plc).
            'ambiente' => env('RNDC_AMBIENTE', 'pruebas'),
            'username' => env('RNDC_USERNAME', ''),
            'password' => env('RNDC_PASSWORD', ''),
            'empresa'  => env('RNDC_EMPRESA', ''),
            // Override opcional del host base (si el RNDC cambia de URL).
            'host_override' => env('RNDC_HOST_OVERRIDE', ''),
            'timeout'  => (int) env('RNDC_TIMEOUT', 30),
        ],
        'cola' => [
            'max_intentos'      => (int) env('COLA_MAX_INTENTOS', 10),
            'minutos_reintento' => (int) env('COLA_MINUTOS_REINTENTO', 15),
            // Interruptor de seguridad: si es false, el worker ARMA y guarda el
            // XML pero NO lo envía al RNDC (modo previsualización). Poner en true
            // para habilitar el envío real (escribe en el RNDC del Ministerio).
            'envio_habilitado'  => (bool) env('COLA_ENVIO_HABILITADO', false),
        ],
    ];
}
