<?php
/**
 * Vista: formulario de Vehículo (crear o editar, proceso 12).
 * Solo campos requeridos + propietario (opcional) + remolque (opcional).
 * @var array<string,mixed> $vehiculo (vacío al crear)
 * @var string $accion
 */
declare(strict_types=1);

$vh     = $vehiculo ?? [];
$accion = $accion ?? ruta('vehiculo.crear');
$editar = !empty($vh);
$val    = static fn (string $c): string => e((string) ($GLOBALS['vh'][$c] ?? ''));

$tenedorTxt = $editar && !empty($vh['tenedor_num_id']) ? trim(($vh['tenedor_tipo_id'] ?? '') . ' ' . $vh['tenedor_num_id']) : '';
$propTxt    = $editar && !empty($vh['propietario_num_id']) ? trim(($vh['propietario_tipo_id'] ?? '') . ' ' . $vh['propietario_num_id']) : '';
$condTxt    = $editar && !empty($vh['conductor_num_id']) ? trim(($vh['conductor_tipo_id'] ?? '') . ' ' . $vh['conductor_num_id']) : '';
$configs    = (new CatalogoRepo())->configuraciones();
$cfgActual  = (string) ($vh['cod_configuracion'] ?? '');
?>
<h1><?= $editar ? 'Editar' : 'Nuevo' ?> Vehículo</h1>
<p class="ayuda">Marca y propietario los puede heredar el RNDC del RUNT por la placa.</p>

<?php flash(); ?>

<form method="post" action="<?= e($accion) ?>" class="form">

    <fieldset>
        <legend>Datos del vehículo</legend>
        <div class="grid">
            <label>Placa * <input type="text" name="placa" maxlength="6" required style="text-transform:uppercase" value="<?= $val('placa') ?>"></label>
            <label>Configuración *
                <select name="cod_configuracion" required>
                    <option value="">—</option>
                    <?php foreach ($configs as $cfg): ?>
                        <option value="<?= e($cfg['codigo']) ?>" <?= $cfg['codigo'] === $cfgActual ? 'selected' : '' ?>>
                            <?= e($cfg['nombre'] . ' - ' . $cfg['descripcion']) ?>
                        </option>
                    <?php endforeach; ?>
                </select>
            </label>
            <label>Peso vacío (kg) * <input type="number" name="peso_vacio" required value="<?= $val('peso_vacio') ?>"></label>
            <label class="ancho-total">Remolque (opcional)
                <div class="autocompletar" data-ac="vehiculos">
                    <input type="text" class="ac-texto" autocomplete="off" placeholder="Buscar placa del remolque…" value="<?= $val('remolque_placa') ?>">
                    <ul class="ac-lista"></ul>
                    <input type="hidden" name="remolque_placa" data-ac-field="placa" value="<?= $val('remolque_placa') ?>">
                </div>
            </label>
        </div>
    </fieldset>

    <fieldset>
        <legend>Tenedor (obligatorio — es un tercero)</legend>
        <label class="ancho-total">Buscar tercero (tenedor) *
            <div class="autocompletar" data-ac="terceros">
                <input type="text" class="ac-texto" autocomplete="off" placeholder="Nombre o identificación…" value="<?= e($tenedorTxt) ?>" <?= $editar ? '' : 'required' ?>>
                <ul class="ac-lista"></ul>
                <input type="hidden" name="tenedor_tipo_id" data-ac-field="tipo_id" value="<?= $val('tenedor_tipo_id') ?>">
                <input type="hidden" name="tenedor_num_id" data-ac-field="num_id" value="<?= $val('tenedor_num_id') ?>">
            </div>
        </label>
        <p class="ayuda">¿No existe? <a href="<?= e(ruta('tercero.nuevo')) ?>" target="_blank">Crear tercero</a>.</p>
    </fieldset>

    <fieldset>
        <legend>Propietario (opcional — lo hereda el RNDC)</legend>
        <label class="ancho-total">Buscar tercero (propietario)
            <div class="autocompletar" data-ac="terceros">
                <input type="text" class="ac-texto" autocomplete="off" placeholder="Nombre o identificación…" value="<?= e($propTxt) ?>">
                <ul class="ac-lista"></ul>
                <input type="hidden" name="propietario_tipo_id" data-ac-field="tipo_id" value="<?= $val('propietario_tipo_id') ?>">
                <input type="hidden" name="propietario_num_id" data-ac-field="num_id" value="<?= $val('propietario_num_id') ?>">
            </div>
        </label>
    </fieldset>

    <fieldset>
        <legend>Conductor por defecto (opcional)</legend>
        <label class="ancho-total">Buscar tercero (conductor)
            <div class="autocompletar" data-ac="terceros" data-ac-params="solo_conductor=1">
                <input type="text" class="ac-texto" autocomplete="off" placeholder="Nombre o identificación…" value="<?= e($condTxt) ?>">
                <ul class="ac-lista"></ul>
                <input type="hidden" name="conductor_tipo_id" data-ac-field="tipo_id" value="<?= $val('conductor_tipo_id') ?>">
                <input type="hidden" name="conductor_num_id" data-ac-field="num_id" value="<?= $val('conductor_num_id') ?>">
            </div>
        </label>
        <p class="ayuda">Se usará como conductor predeterminado al despachar con este vehículo.</p>
    </fieldset>

    <div class="acciones">
        <button type="submit" class="btn btn--primario"><?= $editar ? 'Actualizar' : 'Guardar' ?> vehículo</button>
        <a href="<?= e(ruta('vehiculos')) ?>" class="btn">Cancelar</a>
    </div>
</form>
