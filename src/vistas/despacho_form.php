<?php
/**
 * Vista: confirmar el despacho de una Solicitud.
 * Completa los datos diferidos (vehículo, conductor, responsables de pago)
 * y las remesas del despacho (cada una con su producto, terceros y citas).
 *
 * @var array<string,mixed> $solicitud
 * @var list<array<string,mixed>> $remesas
 */
declare(strict_types=1);

$s = $solicitud;
$v = static fn (string $c): string => e((string) ($s[$c] ?? ''));

$responsables = ['E' => 'Empresa de transporte', 'R' => 'Remitente', 'D' => 'Destinatario'];
$naturalezas  = [
    '1' => 'Carga normal', '2' => 'Carga peligrosa', '3' => 'Carga extradimensionada',
    '4' => 'Carga extrapesada', '5' => 'Desechos peligrosos', '6' => 'Semovientes', '7' => 'Refrigerada',
];
$unidades     = ['1' => 'Kilogramos', '2' => 'Galones'];
$cat          = new CatalogoRepo();
$empaques     = $cat->empaques();

if (!function_exists('acTerceroR')) {
    function acTerceroR(array $s, string $role, string $prefix, string $ph = 'Buscar tercero…'): string
    {
        $tipoName = $role . '_tipo_id';
        $numName  = $role . '_num_id';
        $tipo = (string) ($s[$tipoName] ?? '');
        $num  = (string) ($s[$numName] ?? '');
        $txt  = $num !== '' ? trim($tipo . ' ' . $num) : '';
        return '<div class="autocompletar" data-ac="terceros">'
            . '<input type="text" class="ac-texto" autocomplete="off" placeholder="' . e($ph) . '" value="' . e($txt) . '">'
            . '<ul class="ac-lista"></ul>'
            . '<input type="hidden" name="' . e($prefix) . '[' . e($tipoName) . ']" data-ac-field="tipo_id" value="' . e($tipo) . '">'
            . '<input type="hidden" name="' . e($prefix) . '[' . e($numName) . ']" data-ac-field="num_id" value="' . e($num) . '">'
            . '</div>';
    }
}
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
$acVehiculo = static function (string $name, string $val): string {
    return '<div class="autocompletar" data-ac="vehiculos">'
        . '<input type="text" class="ac-texto" autocomplete="off" placeholder="Buscar placa…" value="' . e($val) . '">'
        . '<ul class="ac-lista"></ul>'
        . '<input type="hidden" name="' . e($name) . '" data-ac-field="placa" value="' . e($val) . '">'
        . '</div>';
};
?>
<div class="cabecera-lista">
    <h1>Confirmar despacho · Solicitud #<?= (int) $s['id'] ?></h1>
    <a href="<?= e(ruta('solicitud.ver', ['id' => (int) $s['id']])) ?>" class="btn">← Volver</a>
</div>

<p class="ayuda">Al confirmar se completa el manifiesto y se crean las remesas. Los documentos se <strong>encolan</strong>
   para enviarse al RNDC (tercero → vehículo → remesas → manifiesto).</p>

<p class="ayuda"><strong>Vehículos restantes:</strong> <?= (int) ($s['cantidad_vehiculos'] ?? 1) ?></p>

<?php flash(); ?>

<form method="post" action="<?= e(ruta('despacho.guardar', ['id' => (int) $s['id']])) ?>" class="form">

    <fieldset>
        <legend>Vehículo y conductor</legend>
        <div class="grid">
            <label>Vehículo (placa) <?= $acVehiculo('placa_vehiculo', (string) ($s['placa_vehiculo'] ?? '')) ?></label>
            <label>Conductor
                <input type="hidden" name="conductor_tipo_id" id="conductor_tipo_id" value="<?= $v('conductor_tipo_id') ?>">
                <input type="hidden" name="conductor_num_id" id="conductor_num_id" value="<?= $v('conductor_num_id') ?>">
                <span id="conductor_label" class="campo-lectura"><?php
                    $ct = $s['conductor_tipo_id'] ?? '';
                    $cn = $s['conductor_num_id'] ?? '';
                    echo e($ct && $cn ? trim("$ct $cn") : '(seleccione placa)');
                ?></span>
            </label>
            <label>Tenedor
                <span id="tenedor_label" class="campo-lectura"><?php
                    $tt = $s['vehiculo_tenedor_tipo_id'] ?? '';
                    $tn = $s['vehiculo_tenedor_num_id'] ?? '';
                    echo e($tt && $tn ? trim($tt . ' ' . $tn) : '(seleccione placa)');
                ?></span>
            </label>
        </div>
        <p class="ayuda">El remolque se hereda del maestro de vehículos. Conductor y tenedor se cargan automáticamente desde el vehículo.</p>
    </fieldset>

    <fieldset>
        <legend>Responsables y valores del viaje</legend>
        <div class="grid">
            <label>Responsable pago cargue <?= selOpc('responsable_pago_cargue', $responsables, (string) ($s['responsable_pago_cargue'] ?? 'E')) ?></label>
            <label>Responsable pago descargue <?= selOpc('responsable_pago_descargue', $responsables, (string) ($s['responsable_pago_descargue'] ?? 'E')) ?></label>
            <label>Valor del anticipo <input type="number" step="0.01" name="valor_anticipo" value="<?= $v('valor_anticipo') ?>"></label>
            <label>NIT EMF (Monitoreo Flota) <input type="text" name="emf" maxlength="20" value="<?= $v('emf') ?>"></label>
        </div>
    </fieldset>

    <fieldset>
        <legend>Remesas del despacho</legend>
        <p class="ayuda">Cada remesa puede tener su propio producto, terceros y citas de cargue/descargue. La primera se prellena con los datos de la solicitud.</p>
        <div id="remesas-container">
            <?php
            $defNatu   = $s['naturaleza_carga'] ?? '1';
            $defEmp    = $s['tipo_empaque'] ?? '';
            $defCod    = $s['mercancia_codigo'] ?? '';
            $defDesc   = $s['descripcion_producto'] ?? '';
            $defUni    = $s['unidad_medida'] ?? '1';
            $defPeso   = $s['peso'] ?? '';
            $defValor  = $s['valor_mercancia'] ?? '';
            $defFechaCargue   = $s['fecha_cita_cargue'] ?? '';
            $defHoraCargue    = $s['hora_cita_cargue'] ?? '';
            $defHorasPactoC   = $s['horas_pacto_cargue'] ?? '';
            $defMinutosPactoC = $s['minutos_pacto_cargue'] ?? '';
            $defFechaDescargue   = $s['fecha_cita_descargue'] ?? '';
            $defHoraDescargue    = $s['hora_cita_descargue'] ?? '';
            $defHorasPactoD   = $s['horas_pacto_descargue'] ?? '';
            $defMinutosPactoD = $s['minutos_pacto_descargue'] ?? '';
            ?>
            <div class="remesa-fila" data-index="0">
                <h3>Remesa <span class="remesa-num">1</span></h3>
                <div class="grid">
                    <label>Naturaleza de la carga
                        <select name="remesas[0][naturaleza_carga]"><?php foreach ($naturalezas as $kv => $kt) { echo '<option value="' . e((string) $kv) . '"' . ((string) $kv === $defNatu ? ' selected' : '') . '>' . e($kt) . '</option>'; } ?></select>
                    </label>
                    <label>Tipo de empaque
                        <select name="remesas[0][tipo_empaque]">
                            <option value="">—</option>
                            <?php foreach ($empaques as $emp): ?>
                                <option value="<?= e($emp['codigo']) ?>" <?= $emp['codigo'] === $defEmp ? 'selected' : '' ?>><?= e($emp['codigo'] . ' - ' . $emp['descripcion']) ?></option>
                            <?php endforeach; ?>
                        </select>
                    </label>
                    <label class="ancho-total">Producto / mercancía
                        <div class="autocompletar" data-ac="productos">
                            <input type="text" class="ac-texto" autocomplete="off" placeholder="Buscar producto…">
                            <ul class="ac-lista"></ul>
                            <input type="text" name="remesas[0][mercancia_codigo]" data-ac-field="codigo" maxlength="10" placeholder="Código" value="<?= e($defCod) ?>">
                        </div>
                    </label>
                    <label class="ancho-total">Descripción del producto <input type="text" name="remesas[0][descripcion_producto]" maxlength="250" value="<?= e($defDesc) ?>"></label>
                    <label>Unidad de medida
                        <select name="remesas[0][unidad_medida]"><?php foreach ($unidades as $uv => $ut) { echo '<option value="' . e((string) $uv) . '"' . ((string) $uv === $defUni ? ' selected' : '') . '>' . e($ut) . '</option>'; } ?></select>
                    </label>
                    <label>Peso (kg) <input type="number" step="0.001" name="remesas[0][peso]" value="<?= e((string) $defPeso) ?>"></label>
                    <label>Valor de la mercancía <input type="number" step="0.01" name="remesas[0][valor_mercancia]" value="<?= e((string) $defValor) ?>"></label>
                </div>
                <div class="grid">
                    <label class="ancho-total">Remitente <?= acTerceroR($s, 'remitente', 'remesas[0]', 'Buscar remitente…') ?></label>
                    <label class="ancho-total">Destinatario <?= acTerceroR($s, 'destinatario', 'remesas[0]', 'Buscar destinatario…') ?></label>
                    <label class="ancho-total">Generador de carga <?= acTerceroR($s, 'generador', 'remesas[0]', 'Buscar generador…') ?></label>
                </div>
                <fieldset class="sub-remesa">
                    <legend>Cargue / Descargue</legend>
                    <div class="grid">
                        <label>Fecha cita cargue <input type="date" name="remesas[0][fecha_cita_cargue]" value="<?= e($defFechaCargue) ?>"></label>
                        <label>Hora cita cargue <input type="time" name="remesas[0][hora_cita_cargue]" value="<?= e($defHoraCargue) ?>"></label>
                        <label>Tiempo pactado cargue (horas) <input type="number" min="0" name="remesas[0][horas_pacto_cargue]" value="<?= e((string) $defHorasPactoC) ?>"></label>
                        <label>Minutos pactado cargue <input type="number" min="0" max="59" name="remesas[0][minutos_pacto_cargue]" value="<?= e((string) $defMinutosPactoC) ?>"></label>
                        <label>Fecha cita descargue <input type="date" name="remesas[0][fecha_cita_descargue]" value="<?= e($defFechaDescargue) ?>"></label>
                        <label>Hora cita descargue <input type="time" name="remesas[0][hora_cita_descargue]" value="<?= e($defHoraDescargue) ?>"></label>
                        <label>Tiempo pactado descargue (horas) <input type="number" min="0" name="remesas[0][horas_pacto_descargue]" value="<?= e((string) $defHorasPactoD) ?>"></label>
                        <label>Minutos pactado descargue <input type="number" min="0" max="59" name="remesas[0][minutos_pacto_descargue]" value="<?= e((string) $defMinutosPactoD) ?>"></label>
                    </div>
                </fieldset>
                <button type="button" class="btn btn--peligro eliminar-remesa" style="display:none;">✕ Eliminar</button>
                <hr>
            </div>
        </div>
        <button type="button" class="btn" id="agregar-remesa">+ Agregar otra remesa</button>
    </fieldset>

    <div class="acciones">
        <button type="submit" class="btn btn--primario">Confirmar despacho y encolar</button>
        <a href="<?= e(ruta('solicitud.ver', ['id' => (int) $s['id']])) ?>" class="btn">Cancelar</a>
    </div>
</form>

<script>
document.addEventListener('DOMContentLoaded', function () {
    var container = document.getElementById('remesas-container');
    var btnAgregar = document.getElementById('agregar-remesa');
    var index = <?= count($remesas ?? []) > 1 ? count($remesas) : 1 ?>;

    function actualizarNumeros() {
        var filas = container.querySelectorAll('.remesa-fila');
        filas.forEach(function (f, i) {
            f.querySelector('.remesa-num').textContent = i + 1;
            f.dataset.index = i;
            var elimBtn = f.querySelector('.eliminar-remesa');
            if (elimBtn) {
                elimBtn.style.display = filas.length > 1 ? '' : 'none';
            }
        });
    }

    btnAgregar.addEventListener('click', function () {
        var primera = container.querySelector('.remesa-fila');
        if (!primera) { return; }
        var clon = primera.cloneNode(true);
        var inputs = clon.querySelectorAll('[name]');
        inputs.forEach(function (inp) {
            inp.name = inp.name.replace(/\[\d+\]/, '[' + index + ']');
        });
        clon.querySelector('.eliminar-remesa').style.display = '';
        var elimBtn = clon.querySelector('.eliminar-remesa');
        elimBtn.addEventListener('click', function () {
            clon.remove();
            actualizarNumeros();
        });
        var acDivs = clon.querySelectorAll('.autocompletar');
        acDivs.forEach(function (ac) {
            if (typeof inicializarAutocompletar === 'function') {
                inicializarAutocompletar(ac);
            }
        });
        container.appendChild(clon);
        index++;
        actualizarNumeros();
    });

    container.querySelectorAll('.eliminar-remesa').forEach(function (btn) {
        btn.addEventListener('click', function () {
            var fila = btn.closest('.remesa-fila');
            if (container.querySelectorAll('.remesa-fila').length > 1) {
                fila.remove();
                actualizarNumeros();
            }
        });
    });

    actualizarNumeros();
});
</script>
