<?php
/**
 * Vista: tablero de inicio. Verifica BD y muestra contadores + fases.
 */
declare(strict_types=1);

$cfg     = config();
$errorDb = null;
$bdOk    = db_disponible($errorDb);

$conteos = [
    'Solicitudes' => $bdOk ? contar_tabla('solicitud_servicio') : null,
    'Manifiestos' => $bdOk ? contar_tabla('manifiesto') : null,
    'Remesas'     => $bdOk ? contar_tabla('remesa') : null,
    'En cola'     => $bdOk ? contar_tabla('cola_envios') : null,
];
$esquemaOk = $bdOk && !in_array(null, $conteos, true);

layout_top('Inicio', 'inicio');
?>
<h1>Tablero</h1>

<section class="tarjeta">
    <div class="estado <?= $bdOk ? 'estado--ok' : 'estado--error' ?>">
        <span class="estado__punto"></span>
        <?= $bdOk
            ? 'Base de datos conectada (' . e($cfg['db']['name']) . ')'
            : 'Sin conexión a la base de datos' ?>
    </div>
    <?php if (!$bdOk): ?>
        <p class="ayuda">Revisa el <code>.env</code>.
            <?php if ($cfg['app']['debug'] && $errorDb): ?><br><small><?= e($errorDb) ?></small><?php endif; ?>
        </p>
    <?php elseif (!$esquemaOk): ?>
        <p class="ayuda">Importa <code>sql/schema.sql</code> desde phpMyAdmin.</p>
    <?php endif; ?>
</section>

<section class="tarjeta">
    <h2>Documentos</h2>
    <div class="contadores">
        <?php foreach ($conteos as $titulo => $valor): ?>
            <div class="contador">
                <div class="contador__num"><?= $valor === null ? '—' : (int) $valor ?></div>
                <div class="contador__lbl"><?= e($titulo) ?></div>
            </div>
        <?php endforeach; ?>
    </div>
</section>

<section class="tarjeta">
    <h2>Acciones</h2>
    <a href="<?= e(ruta('solicitud.nueva')) ?>" class="btn btn--primario">+ Nueva Solicitud de Servicio</a>
    <a href="<?= e(ruta('solicitudes')) ?>" class="btn">Ver solicitudes</a>
</section>

<?php
layout_bottom();
