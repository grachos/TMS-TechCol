<?php
/**
 * Vista: Lista de despachos pendientes de cumplido (procesoid 5 y 6).
 * @var list<array{manifiesto_id:int, solicitud_id:int, consecutivo:string,
 *                  num_manifiesto:string, remesas:int, placa:string,
 *                  remesas_cumplidas:int}> $pendientes
 */
declare(strict_types=1);
?>
<div class="cabecera-lista">
    <h1>Cumplido de despachos</h1>
</div>

<?php flash(); ?>

<?php if (empty($pendientes)): ?>
    <div class="tarjeta vacio">No hay despachos pendientes de cumplido. El manifiesto debe estar aceptado por el RNDC.</div>
<?php else: ?>
    <div class="tabla-responsive">
        <table class="tabla">
            <thead>
                <tr>
                    <th>Manifiesto</th>
                    <th>Solicitud</th>
                    <th>Placa</th>
                    <th>Remesas</th>
                    <th></th>
                </tr>
            </thead>
            <tbody>
                <?php foreach ($pendientes as $p): ?>
                    <tr>
                        <td><?= e($p['num_manifiesto'] ?? '—') ?></td>
                        <td><?= e($p['consecutivo'] ?: ('#' . $p['solicitud_id'])) ?></td>
                        <td><?= e($p['placa'] ?? '—') ?></td>
                        <td><?= (int) $p['remesas'] ?></td>
                        <td>
                            <a href="<?= e(ruta('cumplido.form', ['manifiesto_id' => (int) $p['manifiesto_id']])) ?>" class="btn btn--small btn--primario">Cumplir</a>
                        </td>
                    </tr>
                <?php endforeach; ?>
            </tbody>
        </table>
    </div>
<?php endif; ?>
