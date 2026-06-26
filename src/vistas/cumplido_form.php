<?php
/**
 * Vista: formulario de cumplido de remesas y manifiesto (procesoid 5 y 6).
 *
 * @var array<string,mixed>      $manifiesto
 * @var list<array<string,mixed>> $remesas
 * @var array<string,mixed>      $solicitud
 */
declare(strict_types=1);

$m = $manifiesto;
$s = $solicitud;
$v = static fn (string $c): string => e((string) ($m[$c] ?? ''));
?>
<div class="cabecera-lista">
    <h1>Cumplido · Manifiesto <?= e($m['num_manifiesto'] ?? '') ?></h1>
    <a href="<?= e(ruta('cumplido')) ?>" class="btn">← Volver</a>
</div>

<p class="ayuda">Registra los datos de finalización del viaje. Los documentos se encolarán para enviarse al RNDC (procesoid 5 = cumplido remesa, procesoid 6 = cumplido manifiesto).</p>

<?php flash(); ?>

<form method="post" action="<?= e(ruta('cumplido.guardar', ['manifiesto_id' => (int) $m['id']])) ?>" class="form">

    <!-- Cumplido de remesas -->
    <fieldset>
        <legend>Cumplido de remesas</legend>
        <?php foreach ($remesas as $i => $r): ?>
            <fieldset class="sub-remesa">
                <legend>Remesa <?= $i + 1 ?>: <?= e($r['num_remesa'] ?? '') ?></legend>
                <input type="hidden" name="remesas[<?= $i ?>][id]" value="<?= (int) $r['id'] ?>">
                <div class="grid">
                    <label>Tipo cumplido
                        <select name="remesas[<?= $i ?>][cumplido_tipo]">
                            <option value="C"<?= ($r['cumplido_tipo'] ?? 'C') === 'C' ? ' selected' : '' ?>>C — Normal</option>
                            <option value="S"<?= ($r['cumplido_tipo'] ?? '') === 'S' ? ' selected' : '' ?>>S — Suspendido</option>
                        </select>
                    </label>
                    <label>Cantidad cargada (kg) <input type="number" step="0.001" name="remesas[<?= $i ?>][peso]" value="<?= e((string) ($r['peso'] ?? '')) ?>"></label>
                    <label>Cantidad entregada (kg) <input type="number" step="0.001" name="remesas[<?= $i ?>][cantidad_entregada]" value="<?= e((string) ($r['cantidad_entregada'] ?? $r['peso'] ?? '')) ?>"></label>
                </div>
                <h4 style="margin:12px 0 4px;font-size:12px;color:var(--azul-600);">Citas de descargue</h4>
                <div class="grid">
                    <label>Fecha llegada descargue <input type="date" name="remesas[<?= $i ?>][fecha_llegada_descargue]" value="<?= e($r['fecha_llegada_descargue'] ?? '') ?>"></label>
                    <label>Hora llegada descargue <input type="time" name="remesas[<?= $i ?>][hora_llegada_descargue]" value="<?= e($r['hora_llegada_descargue'] ?? '') ?>"></label>
                    <label>Fecha entrada descargue <input type="date" name="remesas[<?= $i ?>][fecha_entrada_descargue]" value="<?= e($r['fecha_entrada_descargue'] ?? '') ?>"></label>
                    <label>Hora entrada descargue <input type="time" name="remesas[<?= $i ?>][hora_entrada_descargue]" value="<?= e($r['hora_entrada_descargue'] ?? '') ?>"></label>
                    <label>Fecha salida descargue <input type="date" name="remesas[<?= $i ?>][fecha_salida_descargue]" value="<?= e($r['fecha_salida_descargue'] ?? '') ?>"></label>
                    <label>Hora salida descargue <input type="time" name="remesas[<?= $i ?>][hora_salida_descargue]" value="<?= e($r['hora_salida_descargue'] ?? '') ?>"></label>
                </div>
                <details style="margin-top:8px;">
                    <summary style="cursor:pointer;font-size:12px;color:var(--slate-500);">Citas de cargue (si no se capturaron al crear)</summary>
                    <div class="grid" style="margin-top:8px;">
                        <label>Fecha llegada cargue <input type="date" name="remesas[<?= $i ?>][fecha_llegada_cargue]" value="<?= e($r['fecha_llegada_cargue'] ?? '') ?>"></label>
                        <label>Hora llegada cargue <input type="time" name="remesas[<?= $i ?>][hora_llegada_cargue]" value="<?= e($r['hora_llegada_cargue'] ?? '') ?>"></label>
                    </div>
                </details>
            </fieldset>
        <?php endforeach; ?>
    </fieldset>

    <!-- Cumplido del manifiesto -->
    <fieldset>
        <legend>Cumplido del manifiesto</legend>
        <div class="grid">
            <label>Tipo cumplido
                <select name="cumplido_tipo">
                    <option value="C"<?= ($m['cumplido_tipo'] ?? 'C') === 'C' ? ' selected' : '' ?>>C — Normal</option>
                    <option value="S"<?= ($m['cumplido_tipo'] ?? '') === 'S' ? ' selected' : '' ?>>S — Suspendido</option>
                </select>
            </label>
            <label>Fecha entrega documentos <input type="date" name="fecha_entrega_documentos" value="<?= $v('fecha_entrega_documentos') ?>"></label>
            <label>Valor adicional flete <input type="number" step="0.01" name="valor_adicional_flete" value="<?= $v('valor_adicional_flete') ?>"></label>
            <label>Valor descuento flete <input type="number" step="0.01" name="valor_descuento_flete" value="<?= $v('valor_descuento_flete') ?>"></label>
            <label class="ancho-total">Observaciones
                <textarea name="observaciones_cumplido" rows="3"><?= e((string) ($m['observaciones_cumplido'] ?? '')) ?></textarea>
            </label>
        </div>
    </fieldset>

    <div class="acciones">
        <button type="submit" class="btn btn--primario">Guardar cumplido y encolar</button>
        <a href="<?= e(ruta('cumplido')) ?>" class="btn">Cancelar</a>
    </div>
</form>
