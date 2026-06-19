<?php
/**
 * Light TMS - Worker de reintento de la cola offline (store-and-forward).
 *
 * Se ejecuta por CRON en Hostinger, por ejemplo cada 15 minutos:
 *   /usr/bin/php /home/USUARIO/domains/TU_DOMINIO/light-tms/cron/retry_worker.php
 *
 * ESQUELETO (Fase 1). La lógica de drenado real se implementa en la Fase 4:
 *   1. Tomar filas 'pendiente' cuyo programado_para <= ahora, ordenadas por `orden`.
 *   2. Enviarlas con RndcClient::enviar().
 *   3. Marcar 'enviado' (guardar ingresoid) o reprogramar/contar intento en error.
 */

declare(strict_types=1);

require_once __DIR__ . '/../src/db.php';
require_once __DIR__ . '/../src/Despacho/ColaRepo.php';

// Evita ejecución desde el navegador: solo CLI.
if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    exit("Este script solo se ejecuta por línea de comandos (cron).\n");
}

$error = null;
if (!db_disponible($error)) {
    fwrite(STDERR, "[" . date('c') . "] BD no disponible: $error\n");
    exit(1);
}

$habilitado = (bool) config()['cola']['envio_habilitado'];
$r = (new ColaRepo())->drenar();

fwrite(STDOUT, sprintf(
    "[%s] Cola drenada (%s): enviados=%d errores=%d esperando=%d previstos=%d\n",
    date('c'),
    $habilitado ? 'envío REAL' : 'modo seguro',
    $r['enviados'], $r['errores'], $r['esperando'], $r['previstos']
));
exit(0);
