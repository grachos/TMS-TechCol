<?php
/**
 * Light TMS - Prueba del cliente RNDC (CLI).
 *
 * Uso:
 *   php tools/probar_rndc.php            -> muestra el XML que se enviaría (sin enviar)
 *   php tools/probar_rndc.php --enviar   -> hace una llamada real al RNDC (usa el .env)
 *
 * La prueba arma un Tercero (proceso 11) de ejemplo. Sin credenciales válidas,
 * el RNDC responderá con un error de acceso: eso ya confirma que el sobre SOAP,
 * el endpoint y el parseo funcionan.
 */

declare(strict_types=1);

require_once __DIR__ . '/../src/Rndc/RndcClient.php';

if (PHP_SAPI !== 'cli') {
    exit("Solo CLI.\n");
}

$enviar = in_array('--enviar', $argv, true);

// --manifiesto=NUM : consulta un manifiesto (tipo 3, proceso 4) y termina.
$manifiesto = '';
foreach ($argv as $arg) {
    if (str_starts_with($arg, '--manifiesto=')) {
        $manifiesto = substr($arg, 13);
    }
}

// --host=URL : fuerza el host base (útil para probar contra un servidor concreto).
$host = '';
foreach ($argv as $arg) {
    if (str_starts_with($arg, '--host=')) {
        $host = substr($arg, 7);
    }
}

if ($host !== '') {
    $cfg = config()['rndc'];
    $cliente = new RndcClient(
        (string) $cfg['username'],
        (string) $cfg['password'],
        (string) $cfg['ambiente'],
        $host,
        (int) $cfg['timeout'],
    );
} else {
    $cliente = RndcClient::desdeConfig();
}

// Tercero de ejemplo (proceso 11).
$procesoid = 11;
$variables = [
    'NUMNITEMPRESATRANSPORTE' => '900000000',
    'CODTIPOIDTERCERO'        => 'N',
    'NUMIDTERCERO'            => '12345678',
    'NOMIDTERCERO'            => 'PRUEBA LIGHT TMS',
    'NOMENCLATURADIRECCION'   => 'CALLE 1 # 2-3',
    'CODMUNICIPIORNDC'        => '11001000',
];

// Consulta de manifiesto (si se pidió).
if ($manifiesto !== '') {
    $nit = config()['rndc']['empresa'];
    echo "==================== CONSULTA MANIFIESTO $manifiesto ============\n";
    $r = $cliente->consultar(4, [
        'INGRESOID', 'FECHAING', 'NUMMANIFIESTOCARGA', 'NUMIDTITULARMANIFIESTO',
        'NUMPLACA', 'NUMIDCONDUCTOR', 'VALORFLETEPACTADOVIAJE',
    ], [
        'NUMNITEMPRESATRANSPORTE' => $nit,
        'NUMMANIFIESTOCARGA'      => $manifiesto,
    ]);
    echo 'HTTP: ' . $r->httpCode . '  OK: ' . ($r->ok ? 'sí' : 'no') . "\n";
    if ($r->error) {
        echo 'ERROR: ' . $r->error . "\n";
    }
    echo 'Filas: ' . count($r->datos) . "\n";
    foreach ($r->datos as $i => $fila) {
        echo '--- fila ' . ($i + 1) . " ---\n";
        foreach ($fila as $k => $v) {
            echo "  $k = $v\n";
        }
    }
    exit(0);
}

$xmlInterno = $cliente->construirXmlInterno(RndcClient::TIPO_INGRESAR, $procesoid, $variables);
$sobre      = $cliente->construirSobreSoap($xmlInterno);

echo "==================== XML INTERNO (<Request>) ====================\n";
echo $xmlInterno . "\n\n";
echo "==================== SOBRE SOAP COMPLETO ========================\n";
echo $sobre . "\n\n";
echo "==================== ENDPOINT ==================================\n";
echo $cliente->endpointPara($procesoid) . "\n\n";

if (!$enviar) {
    echo "(No se envió nada. Usa --enviar para hacer la llamada real.)\n";
    exit(0);
}

echo "==================== ENVIANDO AL RNDC... =======================\n";
$r = $cliente->ingresar($procesoid, $variables);
echo 'HTTP: ' . $r->httpCode . "\n";
echo 'OK:   ' . ($r->ok ? 'sí' : 'no') . "\n";
echo 'ingresoid: ' . ($r->ingresoId ?? '(ninguno)') . "\n";
echo 'error: ' . ($r->error ?? '(ninguno)') . "\n";
echo "--- respuesta cruda ---\n" . $r->respuestaCruda . "\n";
