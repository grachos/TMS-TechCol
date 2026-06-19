<?php
/**
 * Light TMS - Utilidades comunes.
 */

declare(strict_types=1);

/**
 * Escapa texto para imprimir en HTML de forma segura.
 */
function e(?string $valor): string
{
    return htmlspecialchars((string) $valor, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

/**
 * Cuenta filas de una tabla; devuelve null si la tabla no existe.
 */
function contar_tabla(string $tabla): ?int
{
    // Lista blanca: evita inyección en el nombre de tabla.
    $permitidas = ['solicitud_servicio', 'manifiesto', 'remesa', 'cola_envios'];
    if (!in_array($tabla, $permitidas, true)) {
        return null;
    }
    try {
        return (int) db()->query("SELECT COUNT(*) FROM `$tabla`")->fetchColumn();
    } catch (Throwable) {
        return null;
    }
}
