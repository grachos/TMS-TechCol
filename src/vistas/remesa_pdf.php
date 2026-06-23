<?php
/**
 * Genera un PDF imprimible de la Remesa usando Dompdf.
 *
 * Variables disponibles (inyectadas desde index.php):
 * @var array<string,mixed>      $remesa
 * @var array<string,mixed>      $solicitud
 * @var array<string,mixed>      $empresa
 * @var MunicipioRepo            $muni
 * @var array<string,mixed|null> $terceros   ['remitente','destinatario','generador']
 * @var string                   $natuNombre
 */
declare(strict_types=1);

require_once __DIR__ . '/../../vendor/autoload.php';

use Dompdf\Dompdf;
use Dompdf\Options;

$options = new Options();
$options->set('defaultFont', 'Helvetica');
$options->set('isHtml5ParserEnabled', true);
$dompdf = new Dompdf($options);

$r = $remesa;
$s = $solicitud;
$e = $empresa;

$remitente    = $terceros['remitente'] ?? null;
$destinatario = $terceros['destinatario'] ?? null;
$generador    = $terceros['generador'] ?? null;

$fmtMuni = static function (?string $cod) use ($muni): string {
    if (!$cod) { return '—'; }
    $nom = $muni->nombre($cod);
    return e($nom ?: $cod);
};

$nomTerc = static function (?array $t): string {
    if (!$t) { return '—'; }
    return e(trim(($t['nombre'] ?? '') . ' ' . ($t['primer_apellido'] ?? '') . ' ' . ($t['segundo_apellido'] ?? '')) ?: ($t['nombre_completo'] ?? '—'));
};

$ops = ['G' => 'General', 'P' => 'Paqueteo', 'C' => 'Contenedor Cargado', 'V' => 'Contenedor Vacío'];
$opNombre = $ops[$r['operacion_transporte'] ?? ''] ?? ($r['operacion_transporte'] ?? '—');

$empaques = (new CatalogoRepo())->empaquePorCodigo($r['tipo_empaque'] ?? '') ?? ($r['tipo_empaque'] ?? '—');

$estadosProd = ['L' => 'Líquido', 'S' => 'Sólido/semi-sólido', 'G' => 'Gaseoso'];
$estadoMerc = $estadosProd[$r['estado_producto'] ?? ''] ?? ($r['estado_producto'] ?? '');

$html = '<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <style>
        body { font-family: Helvetica, Arial, sans-serif; font-size: 10px; color: #222; line-height: 1.3; }
        .w-100 { width: 100%; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
        th, td { border: 1px solid #999; padding: 4px; text-align: left; vertical-align: top; }
        th { background-color: #eee; font-weight: bold; font-size: 9px; }
        .header-box { border: 2px solid #000; padding: 8px; text-align: center; background-color: #f2f2f2; }
        .section-header { background-color: #222; color: #fff; padding: 4px; font-weight: bold; text-transform: uppercase; font-size: 10px; margin-top: 10px; margin-bottom: 4px; }
        .col-double { width: 100%; border: none; }
        .col-double td { width: 50%; border: none; padding: 0; vertical-align: top; }
        .col-double td:first-child { padding-right: 4px; }
        .col-double td:last-child { padding-left: 4px; }
    </style>
</head>
<body>

    <table class="w-100" style="border: none;">
        <tr style="border: none;">
            <td width="60%" style="border: none;">
                <div style="font-size: 8px; font-weight: bold;">Transporte Vigilado Super Transporte</div>
                <div style="font-size: 13px; font-weight: bold;">' . e($e['razon_social'] ?? '') . '</div>
                <div><strong>NIT:</strong> ' . e($e['nit'] ?? '') . '</div>
            </td>
            <td width="40%" style="border: none;">
                <div class="header-box">
                    <strong style="font-size: 14px;">REMESA</strong><br>
                    <strong>CONSECUTIVO REMESA:</strong> <span style="color: red; font-size: 12px;">' . e($r['num_remesa'] ?? '') . '</span><br>
                    <span style="font-size: 9px;">N&Uacute;MERO AUTORIZACI&Oacute;N: ' . e($r['rndc_ingreso_id'] ?? '—') . '</span>
                </div>
            </td>
        </tr>
    </table>

    <table>
        <tr>
            <th>Tipo de Operaci&oacute;n:</th><td>' . e($opNombre) . '</td>
            <th>Tipo de Empaque:</th><td>' . e($empaques) . '</td>
            <th>Orden de servicio generador:</th><td>' . e($s['consecutivo'] ?? '—') . '</td>
        </tr>
    </table>

    <div class="section-header">Propietario / Contratante / Generador</div>
    <table>
        <tr>
            <th>Nombre/Raz&oacute;n Social:</th><td colspan="3">' . $nomTerc($generador) . '</td>
        </tr>
        <tr>
            <th>Identificaci&oacute;n:</th><td>' . e(($generador['tipo_id'] ?? '') . ' ' . ($generador['num_id'] ?? '—')) . '</td>
            <th>Tel&eacute;fono contratante:</th><td>' . e($generador['telefono'] ?? '—') . '</td>
        </tr>
        <tr>
            <th>E-mail contratante:</th><td colspan="3">' . e($generador['email'] ?? '—') . '</td>
        </tr>
    </table>

    <table class="col-double">
        <tr>
            <td>
                <div class="section-header">Remitente / Lugar de Cargue</div>
                <table class="w-100">
                    <tr><th>Tipo ID / N&uacute;mero:</th><td>' . e(($remitente['tipo_id'] ?? '') . ' - ' . ($remitente['num_id'] ?? '—')) . '</td></tr>
                    <tr><th>Sede / C&oacute;digo:</th><td>' . e(($remitente['nombre_sede'] ?? '') . ' (' . ($remitente['sede'] ?? '') . ')') . '</td></tr>
                    <tr><th>Nombre Muelle:</th><td>' . $nomTerc($remitente) . '</td></tr>
                    <tr><th>Direcci&oacute;n:</th><td>' . e($remitente['direccion'] ?? '—') . '</td></tr>
                    <tr><th>Municipio:</th><td>' . $fmtMuni($remitente['cod_municipio'] ?? null) . '</td></tr>
                    <tr><th>Coordenadas:</th><td style="font-size: 8px;">Latitud: ' . e((string) ($remitente['latitud'] ?? '—')) . ' | Longitud: ' . e((string) ($remitente['longitud'] ?? '—')) . '</td></tr>
                    <tr><th>Fecha Cita / Hora:</th><td>' . e($r['fecha_cita_cargue'] ?? '') . ' @ ' . e($r['hora_cita_cargue'] ?? '') . '</td></tr>
                    <tr><th>Tiempo Espera Cargue:</th><td>' . e(($r['horas_pacto_cargue'] ?? '') ? ($r['horas_pacto_cargue'] . 'h ' . ($r['minutos_pacto_cargue'] ?? '0') . 'm') : '—') . '</td></tr>
                </table>
            </td>
            <td>
                <div class="section-header">Destinatario / Lugar de Descargue</div>
                <table class="w-100">
                    <tr><th>Tipo ID / N&uacute;mero:</th><td>' . e(($destinatario['tipo_id'] ?? '') . ' - ' . ($destinatario['num_id'] ?? '—')) . '</td></tr>
                    <tr><th>Sede / C&oacute;digo:</th><td>' . e(($destinatario['nombre_sede'] ?? '') . ' (' . ($destinatario['sede'] ?? '') . ')') . '</td></tr>
                    <tr><th>Nombre Muelle:</th><td>' . $nomTerc($destinatario) . '</td></tr>
                    <tr><th>Direcci&oacute;n:</th><td>' . e($destinatario['direccion'] ?? '—') . '</td></tr>
                    <tr><th>Municipio:</th><td>' . $fmtMuni($destinatario['cod_municipio'] ?? null) . '</td></tr>
                    <tr><th>Coordenadas:</th><td style="font-size: 8px;">Latitud: ' . e((string) ($destinatario['latitud'] ?? '—')) . ' | Longitud: ' . e((string) ($destinatario['longitud'] ?? '—')) . '</td></tr>
                    <tr><th>Fecha Cita / Hora:</th><td>' . e($r['fecha_cita_descargue'] ?? '') . ' @ ' . e($r['hora_cita_descargue'] ?? '') . '</td></tr>
                    <tr><th>Tiempo Espera Descargue:</th><td>' . e(($r['horas_pacto_descargue'] ?? '') ? ($r['horas_pacto_descargue'] . 'h ' . ($r['minutos_pacto_descargue'] ?? '0') . 'm') : '—') . '</td></tr>
                </table>
            </td>
        </tr>
    </table>

    <div class="section-header">Informaci&oacute;n de la Carga</div>
    <table>
        <tr>
            <th>Naturaleza Carga:</th><td>' . e($natuNombre) . '</td>
            <th>C&oacute;digo Producto (Armonizado):</th><td>' . e($r['mercancia_codigo'] ?? '—') . '</td>
        </tr>
        <tr>
            <th>Cantidad Kilos:</th><td>' . e((string) ($r['peso'] ?? '—')) . ' kg</td>
            <th>U/M Mercanc&iacute;a / Cantidad:</th><td>' . e($r['unidad_medida'] ?? '—') . ' [Cant: ' . e((string) ($r['cantidad_cargada'] ?? '—')) . ']</td>
        </tr>
        <tr>
            <th>C&oacute;digo UN (Naciones Unidas):</th><td>' . e($r['codigo_un'] ?? '—') . '</td>
            <th>Estado del Envase / Grupo Embalaje:</th><td>' . e($estadoMerc ?: '—') . ' / —</td>
        </tr>
        <tr>
            <th>Designaci&oacute;n Mercanc&iacute;a:</th><td colspan="3">' . e($r['descripcion_producto'] ?? '—') . '</td>
        </tr>
        <tr>
            <th>Caracter&iacute;sticas Peligrosidad:</th><td colspan="3">' . e($r['descripcion_producto'] ?? '—') . '</td>
        </tr>
    </table>

    <div class="section-header">Seguro de la Mercanc&iacute;a</div>
    <table>
        <thead>
            <tr>
                <th>Tipo P&oacute;liza</th>
                <th>Tomador de la P&oacute;liza</th>
                <th>N&uacute;mero</th>
                <th>Fecha Vencimiento</th>
                <th>Aseguradora</th>
                <th>NIT Aseguradora</th>
            </tr>
        </thead>
        <tbody>
            <tr>
                <td>&nbsp;</td>
                <td>' . e($r['dueno_poliza'] ?? '—') . '</td>
                <td>' . e($e['nro_poliza'] ?? '—') . '</td>
                <td>&nbsp;</td>
                <td>&nbsp;</td>
                <td>&nbsp;</td>
            </tr>
        </tbody>
    </table>

    <div class="section-header">Observaciones</div>
    <table>
        <tr>
            <td style="height: 35px; font-size: 11px;"><strong>' . e($s['observaciones'] ?? '') . '</strong></td>
        </tr>
    </table>

</body>
</html>';

$dompdf->loadHtml($html);
$dompdf->setPaper('A4', 'portrait');
$dompdf->render();

$dompdf->stream('remesa_' . e($r['num_remesa'] ?? $remesaId) . '.pdf', ['Attachment' => false]);
