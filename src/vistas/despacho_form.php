<?php
/**
 * Vista: confirmar el despacho de una Solicitud.
 * Completa los datos diferidos (vehículo, conductor, propietario de carga,
 * citas/tiempos de cargue-descargue, responsables de pago) y encola los
 * documentos para su envío al RNDC.
 *
 * @var array<string,mixed> $solicitud
 */
declare(strict_types=1);

$s = $solicitud;
$v = static fn (string $c): string => e((string) ($s[$c] ?? ''));

$responsables = ['E' => 'Empresa de transporte', 'R' => 'Remitente', 'D' => 'Destinatario'];
$duenosPoliza = ['E' => 'Empresa de transporte', 'R' => 'Remitente', 'D' => 'Destinatario', 'P' => 'Propietario'];

if (!function_exists('selOpc')) {
    function selOpc(string $name, array $opciones, string $sel, bool $conVacio = true): string
    {
        $h = '<select name="' . e($name) . '">';
        if ($conVacio) { $h .= '<option value="">—</option>'; }
        foreach ($opciones as $val => $t) {
            $h .= '<option value="' . e((string) $val) . '"' . ((string) $val === $sel ? ' selected' : '') . '>' . e($t) . '</option>';
        }
        return $h . '</select>';
    }
}
/** Picker de vehículo (placa). */
$acVehiculo = static function (string $name, string $val): string {
    return '<div class="autocompletar" data-ac="vehiculos">'
        . '<input type="text" class="ac-texto" autocomplete="off" placeholder="Buscar placa…" value="' . e($val) . '">'
        . '<ul class="ac-lista"></ul>'
        . '<input type="hidden" name="' . e($name) . '" data-ac-field="placa" value="' . e($val) . '">'
        . '</div>';
};
/** Picker de tercero (tipo + num). */
$acTercero = static function (string $tipoName, string $numName, string $tipo, string $num, string $params = ''): string {
    $txt = $num !== '' ? trim($tipo . ' ' . $num) : '';
    $p   = $params !== '' ? ' data-ac-params="' . e($params) . '"' : '';
    return '<div class="autocompletar" data-ac="terceros"' . $p . '>'
        . '<input type="text" class="ac-texto" autocomplete="off" placeholder="Buscar tercero…" value="' . e($txt) . '">'
        . '<ul class="ac-lista"></ul>'
        . '<input type="hidden" name="' . e($tipoName) . '" data-ac-field="tipo_id" value="' . e($tipo) . '">'
        . '<input type="hidden" name="' . e($numName) . '" data-ac-field="num_id" value="' . e($num) . '">'
        . '</div>';
};
?>
<div class="cabecera-lista">
    <h1>Confirmar despacho · Solicitud #<?= (int) $s['id'] ?></h1>
    <a href="<?= e(ruta('solicitud.ver', ['id' => (int) $s['id']])) ?>" class="btn">← Volver</a>
</div>

<p class="ayuda">Al confirmar se completan el manifiesto y la remesa, y se <strong>encolan</strong>
   para enviarse al RNDC (tercero → vehículo → remesa → manifiesto).</p>

<?php flash(); ?>

<form method="post" action="<?= e(ruta('despacho.guardar', ['id' => (int) $s['id']])) ?>" class="form">

    <fieldset>
        <legend>Vehículo y conductor</legend>
        <div class="grid">
            <label>Vehículo (placa) <?= $acVehiculo('placa_vehiculo', (string) ($s['placa_vehiculo'] ?? '')) ?></label>
            <label>Conductor <?= $acTercero('conductor_tipo_id', 'conductor_num_id', (string) ($s['conductor_tipo_id'] ?? ''), (string) ($s['conductor_num_id'] ?? ''), 'solo_conductor=1') ?></label>
        </div>
        <p class="ayuda">El remolque se hereda del maestro de vehículos.</p>
    </fieldset>

    <fieldset>
        <legend>Propietario de la carga</legend>
        <div class="grid">
            <label class="ancho-total">Propietario <?= $acTercero('propietario_carga_tipo_id', 'propietario_carga_num_id', (string) ($s['propietario_carga_tipo_id'] ?? ''), (string) ($s['propietario_carga_num_id'] ?? '')) ?></label>
            <label>Dueño de la póliza <?= selOpc('tomador_poliza', $duenosPoliza, (string) ($s['tomador_poliza'] ?? 'E'), false) ?></label>
        </div>
    </fieldset>

    <fieldset>
        <legend>Cargue / Descargue</legend>
        <div class="grid">
            <label>Fecha cita cargue <input type="date" name="fecha_cita_cargue" value="<?= $v('fecha_cita_cargue') ?>"></label>
            <label>Hora cita cargue <input type="time" name="hora_cita_cargue" value="<?= $v('hora_cita_cargue') ?>"></label>
            <label>Tiempo pactado cargue (horas) <input type="number" min="0" name="horas_pacto_cargue" value="<?= $v('horas_pacto_cargue') ?>"></label>
            <label>Minutos pactado cargue <input type="number" min="0" max="59" name="minutos_pacto_cargue" value="<?= $v('minutos_pacto_cargue') ?>"></label>
            <label>Fecha cita descargue <input type="date" name="fecha_cita_descargue" value="<?= $v('fecha_cita_descargue') ?>"></label>
            <label>Hora cita descargue <input type="time" name="hora_cita_descargue" value="<?= $v('hora_cita_descargue') ?>"></label>
            <label>Tiempo pactado descargue (horas) <input type="number" min="0" name="horas_pacto_descargue" value="<?= $v('horas_pacto_descargue') ?>"></label>
            <label>Minutos pactado descargue <input type="number" min="0" max="59" name="minutos_pacto_descargue" value="<?= $v('minutos_pacto_descargue') ?>"></label>
            <label>Responsable pago cargue <?= selOpc('responsable_pago_cargue', $responsables, (string) ($s['responsable_pago_cargue'] ?? 'E')) ?></label>
            <label>Responsable pago descargue <?= selOpc('responsable_pago_descargue', $responsables, (string) ($s['responsable_pago_descargue'] ?? 'E')) ?></label>
        </div>
    </fieldset>

    <div class="acciones">
        <button type="submit" class="btn btn--primario">Confirmar despacho y encolar</button>
        <a href="<?= e(ruta('solicitud.ver', ['id' => (int) $s['id']])) ?>" class="btn">Cancelar</a>
    </div>
</form>
