<?php
/**
 * Vista: monitor de la cola de envíos al RNDC (store-and-forward).
 * @var list<array<string,mixed>> $filas
 * @var array<string,int>         $resumen
 * @var bool                      $envioHabilitado
 */
declare(strict_types=1);
?>
<div class="cabecera-lista">
    <h1>Cola de envíos al RNDC</h1>
    <a href="<?= e(ruta('cola.procesar')) ?>" class="btn btn--primario">Procesar ahora</a>
</div>

<?php flash(); ?>

<?php if (!$envioHabilitado): ?>
    <div class="alerta alerta--ok">
        <strong>Modo seguro activo.</strong> El worker arma y previsualiza el XML pero
        <strong>no</strong> lo envía al RNDC. Para habilitar el envío real, define
        <code>COLA_ENVIO_HABILITADO=true</code> en el archivo <code>.env</code>.
    </div>
<?php else: ?>
    <div class="alerta alerta--err">
        <strong>Envío REAL habilitado.</strong> Procesar la cola escribirá documentos en el RNDC
        (ambiente: <?= e(config()['rndc']['ambiente']) ?>).
    </div>
<?php endif; ?>

<p class="ayuda">
    Resumen:
    <?php foreach (['pendiente', 'enviando', 'enviado', 'error'] as $est): ?>
        <span class="chip chip--<?= e($est) ?>"><?= e($est) ?>: <?= (int) ($resumen[$est] ?? 0) ?></span>
    <?php endforeach; ?>
</p>

<?php if (empty($filas)): ?>
    <div class="tarjeta vacio">La cola está vacía. Confirma el despacho de una solicitud para encolar sus documentos.</div>
<?php else: ?>
    <table class="tabla">
        <thead>
            <tr>
                <th>#</th>
                <th>Solicitud</th>
                <th>Documento</th>
                <th>Proceso</th>
                <th>Estado</th>
                <th>Intentos</th>
                <th>Ingreso RNDC</th>
                <th>Último mensaje</th>
                <th></th>
            </tr>
        </thead>
        <tbody>
            <?php foreach ($filas as $f): ?>
                <tr>
                    <td><?= (int) $f['id'] ?></td>
                    <td><?= e($f['consecutivo'] ?? ('#' . $f['solicitud_id'])) ?></td>
                    <td><?= e($f['tipo_documento']) ?></td>
                    <td><?= (int) $f['proceso_rndc'] ?></td>
                    <td><span class="chip chip--<?= e($f['estado']) ?>"><?= e($f['estado']) ?></span></td>
                    <td><?= (int) $f['intentos'] ?>/<?= (int) $f['max_intentos'] ?></td>
                    <td><?= e($f['rndc_ingreso_id'] ?? '—') ?></td>
                    <td><small><?= e(mb_strimwidth((string) ($f['ultimo_error'] ?? ''), 0, 80, '…')) ?></small></td>
                    <td><a href="<?= e(ruta('cola.xml', ['id' => (int) $f['id']])) ?>" target="_blank">Ver XML</a></td>
                </tr>
            <?php endforeach; ?>
        </tbody>
    </table>
<?php endif; ?>
