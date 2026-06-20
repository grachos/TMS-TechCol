<?php
/**
 * Vista: datos de la empresa propia (NIT, póliza). Se usan en remesa/manifiesto.
 * @var array<string,mixed> $empresa
 */
declare(strict_types=1);

$tiposId = ['N' => 'N - NIT', 'C' => 'C - Cédula'];
?>
<h1>Datos de la empresa</h1>
<p class="ayuda">Estos datos se usan automáticamente en las remesas y manifiestos
   (NIT de la empresa transportadora y número de póliza).</p>

<?php flash(); ?>

<form method="post" action="<?= e(ruta('empresa.guardar')) ?>" class="form">
    <fieldset>
        <legend>Empresa transportadora</legend>
        <div class="grid">
            <label>Tipo identificación
                <select name="tipo_id">
                    <?php foreach ($tiposId as $v => $t): ?>
                        <option value="<?= e($v) ?>" <?= ($empresa['tipo_id'] ?? 'N') === $v ? 'selected' : '' ?>><?= e($t) ?></option>
                    <?php endforeach; ?>
                </select>
            </label>
            <label>NIT *
                <input type="text" name="nit" maxlength="20" required value="<?= e((string) ($empresa['nit'] ?? '')) ?>">
            </label>
            <label class="ancho-total">Razón social
                <input type="text" name="razon_social" maxlength="150" value="<?= e((string) ($empresa['razon_social'] ?? '')) ?>">
            </label>
            <label>Nro. póliza
                <input type="text" name="nro_poliza" maxlength="20" value="<?= e((string) ($empresa['nro_poliza'] ?? '')) ?>">
            </label>
            <label>Últ. consecutivo remesa
                <input type="number" name="consecutivo_remesa" min="0" value="<?= (int) ($empresa['consecutivo_remesa'] ?? 0) ?>">
                <small>Se auto-incrementa al crear solicitud</small>
            </label>
            <label>Últ. consecutivo manifiesto
                <input type="number" name="consecutivo_manifiesto" min="0" value="<?= (int) ($empresa['consecutivo_manifiesto'] ?? 0) ?>">
                <small>Se auto-incrementa al crear solicitud</small>
            </label>
            <label>Últ. radicado remesa
                <input type="number" name="radicado_remesa" min="0" value="<?= (int) ($empresa['radicado_remesa'] ?? 0) ?>">
                <small>Se auto-incrementa al generar XML de remesa</small>
            </label>
        </div>
    </fieldset>
    <div class="acciones">
        <button type="submit" class="btn btn--primario">Guardar</button>
    </div>
</form>
