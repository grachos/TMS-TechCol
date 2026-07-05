<?php
/**
 * Light TMS - Importar catálogo de productos desde CSV oficial del RNDC.
 *
 * Uso: php importar_productos_csv.php <ruta_al_csv>
 * Ej:  php importar_productos_csv.php "C:\Users\PC\Downloads\Maestro_Codificación de Productos_RNDC.csv"
 */

declare(strict_types=1);

require_once __DIR__ . '/../src/db.php';

$ruta = $argv[1] ?? '';
if ($ruta === '' || !is_file($ruta)) {
    fwrite(STDERR, "Uso: php importar_productos_csv.php <ruta_al_csv>\n");
    exit(1);
}

// El CSV viene en Windows-1252 (Latin-1). Convertir a UTF-8.
$raw = file_get_contents($ruta);
if ($raw === false) {
    fwrite(STDERR, "Error al leer el archivo: $ruta\n");
    exit(1);
}
$utf8 = mb_convert_encoding($raw, 'UTF-8', 'Windows-1252');

$lineas = explode("\n", $utf8);
$header = array_shift($lineas); // descartar encabezado

// Columnas esperadas (orden del CSV):
// FECHAINGRESO, TIPO, CODIGO, CAPITULO, PARTIDA, APLICASICETAC,
// NECESITASUBPARTIDA, HIDROCARBURO, UNIDADGALONES, IMPOCONSUMO,
// MERCANCIAPELIGROSA, CLASEDIVISION, PELIGROSECUNDARIO,
// GRUPOEMBALAJEENVASE, NOMBREYDESCRIPCION, ALERTA

db()->exec('TRUNCATE TABLE producto');

$stmt = db()->prepare(
    "INSERT INTO producto (fecha_ingreso, tipo, codigo, capitulo, partida,
                           aplica_sicetac, necesita_subpartida, hidrocarburo,
                           unidad_galones, impoconsumo, peligrosa,
                           clase_division, peligro_secundario, grupo_embalaje,
                           nombre, alerta)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
);

$contador = 0;
$errores  = 0;

foreach ($lineas as $i => $linea) {
    $linea = trim($linea);
    if ($linea === '') { continue; }

    $cols = explode("\t", $linea);
    // Esperamos 16 columnas; si falta la última (ALERTA), rellenar con null
    while (count($cols) < 16) { $cols[] = ''; }

    $v = static function (int $idx) use ($cols): ?string {
        $val = trim($cols[$idx] ?? '');
        return $val !== '' ? $val : null;
    };

    // NOMBREYDESCRIPCION (col 14); si no existe, usar CAPITULO (col 3)
    $nombre = $v(14) ?? $v(3);
    if ($nombre === null) { continue; }

    try {
        $stmt->execute([
            $v(0),   // fecha_ingreso
            $v(1),   // tipo
            $v(2),   // codigo
            $v(3),   // capitulo
            $v(4),   // partida
            $v(5),   // aplica_sicetac
            $v(6),   // necesita_subpartida
            $v(7),   // hidrocarburo
            $v(8),   // unidad_galones
            $v(9),   // impoconsumo
            $v(10),  // peligrosa
            $v(11),  // clase_division
            $v(12),  // peligro_secundario
            $v(13),  // grupo_embalaje
            $nombre,
            $v(15),  // alerta
        ]);
        $contador++;
    } catch (Exception $e) {
        fwrite(STDERR, "Error línea " . ($i + 2) . ": " . $e->getMessage() . "\n");
        $errores++;
    }
}

echo "Importación completada: $contador productos insertados, $errores errores.\n";
