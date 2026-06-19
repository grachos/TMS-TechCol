<?php
/**
 * Vista: formulario de Tercero (crear o editar, proceso 11).
 * @var array<string,mixed> $tercero  (vacío al crear)
 * @var string $accion                (URL destino del form)
 */
declare(strict_types=1);

$t      = $tercero ?? [];
$accion = $accion ?? ruta('tercero.crear');
$editar = !empty($t);

$tiposId = [
    'C' => 'C - Cédula de ciudadanía', 'N' => 'N - NIT', 'E' => 'E - Cédula de extranjería',
    'T' => 'T - Tarjeta de identidad', 'P' => 'P - Pasaporte',
];
$v = static fn (string $c): string => e((string) ($GLOBALS['t'][$c] ?? ''));

if (!function_exists('selTipoT')) {
    function selTipoT(string $name, array $opciones, string $actual): string
    {
        $h = '<select name="' . e($name) . '">';
        foreach ($opciones as $val => $etq) {
            $h .= '<option value="' . e($val) . '"' . ($val === $actual ? ' selected' : '') . '>' . e($etq) . '</option>';
        }
        return $h . '</select>';
    }
}
?>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<script defer src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>

<h1><?= $editar ? 'Editar' : 'Nuevo' ?> Tercero</h1>
<p class="ayuda">Remitentes, destinatarios, propietarios, tenedores y conductores.</p>

<?php flash(); ?>

<form method="post" action="<?= e($accion) ?>" class="form">

    <fieldset>
        <legend>Datos generales</legend>
        <div class="grid">
            <label>Tipo de identificación * <?= selTipoT('tipo_id', $tiposId, (string) ($t['tipo_id'] ?? 'C')) ?></label>
            <label>Número de identificación * <input type="text" name="num_id" maxlength="15" required value="<?= $v('num_id') ?>"></label>
            <label class="ancho-total">Nombre o razón social * <input type="text" name="nombre" maxlength="100" required value="<?= $v('nombre') ?>"></label>
            <label>Primer apellido <input type="text" name="primer_apellido" maxlength="100" value="<?= $v('primer_apellido') ?>"></label>
            <label>Segundo apellido <input type="text" name="segundo_apellido" maxlength="100" value="<?= $v('segundo_apellido') ?>"></label>
            <label>Régimen simple (S/N) <input type="text" name="regimen_simple" maxlength="1" value="<?= $v('regimen_simple') ?>"></label>
        </div>
    </fieldset>

    <fieldset>
        <legend>Ubicación</legend>
        <div class="grid">
            <label class="ancho-total">Municipio *
                <div class="autocompletar" data-ac="municipios">
                    <input type="text" class="ac-texto" name="municipio_nombre" autocomplete="off" placeholder="Escribe y elige…" required value="<?= $v('municipio_nombre') ?>">
                    <ul class="ac-lista"></ul>
                    <input type="hidden" name="cod_municipio" data-ac-field="codigo_rndc" value="<?= $v('cod_municipio') ?>">
                </div>
            </label>
            <label class="ancho-total">Dirección * <input type="text" name="direccion" maxlength="120" required value="<?= $v('direccion') ?>"></label>
            <label>Sede <input type="text" name="sede" maxlength="6" value="<?= $v('sede') ?>"></label>
            <label>Nombre de la sede <input type="text" name="nombre_sede" maxlength="40" value="<?= $v('nombre_sede') ?>"></label>
            <label>Teléfono <input type="text" name="telefono" maxlength="10" value="<?= $v('telefono') ?>"></label>
            <label>Celular <input type="text" name="celular" maxlength="10" value="<?= $v('celular') ?>"></label>
            <label class="ancho-total">Correo <input type="email" name="email" maxlength="120" value="<?= $v('email') ?>"></label>
        </div>
    </fieldset>

    <fieldset>
        <legend>Ubicación geográfica (latitud / longitud)</legend>
        <div class="mapa-barra">
            <input type="text" id="mapa-buscar" placeholder="Buscar dirección o lugar…">
            <button type="button" id="mapa-buscar-btn" class="btn">Buscar</button>
            <a href="#" id="abrir-google-maps" class="btn">Abrir en Google Maps</a>
        </div>
        <div class="mapa-barra">
            <input type="text" id="mapa-pegar" placeholder="Pega un enlace de Google Maps (con @lat,lng) o escribe lat,lng">
            <button type="button" id="mapa-pegar-btn" class="btn">Usar enlace</button>
        </div>
        <div id="mapa"></div>
        <p class="ayuda">Haz clic en el mapa o arrastra el marcador para fijar la ubicación.</p>
        <div class="grid">
            <label>Latitud <input type="text" id="latitud" name="latitud" readonly value="<?= $v('latitud') ?>" placeholder="(clic en el mapa)"></label>
            <label>Longitud <input type="text" id="longitud" name="longitud" readonly value="<?= $v('longitud') ?>" placeholder="(clic en el mapa)"></label>
        </div>
    </fieldset>

    <fieldset>
        <legend>¿Es conductor?</legend>
        <label class="check">
            <input type="checkbox" name="es_conductor" value="1" id="chk-conductor" <?= ((int) ($t['es_conductor'] ?? 0) === 1) ? 'checked' : '' ?>> Sí, este tercero es conductor
        </label>
        <div class="grid" id="campos-conductor" style="margin-top:10px;">
            <label>Categoría licencia <input type="text" name="categoria_licencia" maxlength="3" value="<?= $v('categoria_licencia') ?>"></label>
            <label>Número licencia <input type="text" name="num_licencia" maxlength="20" value="<?= $v('num_licencia') ?>"></label>
            <label>Vencimiento licencia <input type="date" name="fecha_venc_licencia" value="<?= $v('fecha_venc_licencia') ?>"></label>
        </div>
    </fieldset>

    <div class="acciones">
        <button type="submit" class="btn btn--primario"><?= $editar ? 'Actualizar' : 'Guardar' ?> tercero</button>
        <a href="<?= e(ruta('terceros')) ?>" class="btn">Cancelar</a>
    </div>
</form>

<script>
document.addEventListener('DOMContentLoaded', function () {
    var chk = document.getElementById('chk-conductor');
    var cc = document.getElementById('campos-conductor');
    function tog(){ cc.style.display = chk.checked ? '' : 'none'; }
    if (chk) { chk.addEventListener('change', tog); tog(); }
});
</script>
