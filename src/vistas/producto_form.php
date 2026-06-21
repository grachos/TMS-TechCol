<?php
/**
 * Vista: Editar producto (codigo_un, estado_producto).
 * @var array<string,string|null> $prod
 */
declare(strict_types=1);
$estados = ['L' => 'Líquido', 'S' => 'Sólido o semi sólido', 'G' => 'Gaseoso'];
?>
<h1>Editar producto</h1>
<?php flash(); ?>
<p><strong>Código:</strong> <?= e($prod['codigo']) ?> &mdash; <strong>Nombre:</strong> <?= e($prod['nombre']) ?></p>
<form method="post" class="form">
    <fieldset>
        <legend>Datos para mercancía peligrosa</legend>
        <div class="grid">
            <label>Código UN
                <input type="text" name="codigo_un" maxlength="5" value="<?= e((string) ($prod['codigo_un'] ?? '')) ?>">
                <small>Obligatorio si naturaleza = Carga peligrosa</small>
            </label>
            <label>Estado del producto
                <select name="estado_producto">
                    <option value="">—</option>
                    <?php foreach ($estados as $k => $v): ?>
                        <option value="<?= e($k) ?>"<?= ($prod['estado_producto'] ?? '') === $k ? ' selected' : '' ?>><?= e($v) ?></option>
                    <?php endforeach; ?>
                </select>
            </label>
        </div>
    </fieldset>
    <div class="acciones">
        <button type="submit" class="btn btn--primario">Guardar</button>
        <a href="<?= e(ruta('productos')) ?>" class="btn">Cancelar</a>
    </div>
</form>
