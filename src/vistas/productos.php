<?php
/**
 * Vista: Lista de productos (catálogo) con paginación.
 * @var list<array{codigo:string,nombre:string,tipo:string,codigo_un:string,estado_producto:string}> $lista
 * @var int $total
 * @var int $pagina
 * @var int $paginas
 */
declare(strict_types=1);
$q = (string) ($_GET['q'] ?? '');
$estados = ['L' => 'Líquido', 'S' => 'Sólido/semi-sólido', 'G' => 'Gaseoso'];
?>
<h1>Productos <small><?= number_format($total) ?> registros</small></h1>
<?php flash(); ?>
<form method="get" class="barra-busqueda">
    <input type="hidden" name="r" value="productos">
    <input type="text" name="q" value="<?= e($q) ?>" placeholder="Buscar producto…" autofocus>
    <button type="submit" class="btn">Buscar</button>
    <a href="<?= e(ruta('productos')) ?>" class="btn">Limpiar</a>
</form>
<table class="tabla">
    <thead>
        <tr>
            <th>Código</th>
            <th>Nombre</th>
            <th>Tipo</th>
            <th>UN</th>
            <th>Estado</th>
            <th></th>
        </tr>
    </thead>
    <tbody>
    <?php foreach ($lista as $p): ?>
        <tr>
            <td><?= e($p['codigo']) ?></td>
            <td><?= e($p['nombre']) ?></td>
            <td><?= e($p['tipo'] ?? '') ?></td>
            <td><?= e($p['codigo_un'] ?? '') ?></td>
            <td><?= e($estados[$p['estado_producto'] ?? ''] ?? '') ?></td>
            <td><a href="<?= e(ruta('producto.editar', ['codigo' => $p['codigo']])) ?>" class="btn btn--small">Editar</a></td>
        </tr>
    <?php endforeach; ?>
    <?php if (!$lista): ?>
        <tr><td colspan="6" class="vacio">No se encontraron productos.</td></tr>
    <?php endif; ?>
    </tbody>
</table>
<?php if ($paginas > 1): ?>
<?php $bloque = (int) ceil($pagina / 10);
$inicio = ($bloque - 1) * 10 + 1;
$fin = min($bloque * 10, $paginas); ?>
<nav class="paginacion">
    <?php if ($bloque > 1): ?>
        <a href="<?= e(ruta('productos', ['q' => $q, 'p' => $inicio - 1])) ?>" class="btn btn--small">&laquo;</a>
    <?php endif; ?>
    <?php for ($i = $inicio; $i <= $fin; $i++): ?>
        <a href="<?= e(ruta('productos', ['q' => $q, 'p' => $i])) ?>" class="btn btn--small<?= $i === $pagina ? ' btn--activo' : '' ?>"><?= $i ?></a>
    <?php endfor; ?>
    <?php if ($fin < $paginas): ?>
        <a href="<?= e(ruta('productos', ['q' => $q, 'p' => $fin + 1])) ?>" class="btn btn--small">&raquo;</a>
    <?php endif; ?>
</nav>
<?php endif; ?>
