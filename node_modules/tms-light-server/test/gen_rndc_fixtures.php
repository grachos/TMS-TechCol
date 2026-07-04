<?php
/**
 * Generates ground-truth fixtures from the PHP RndcClient so the TypeScript port
 * can be asserted byte-for-byte. Run:  php server/test/gen_rndc_fixtures.php
 * Writes: server/test/rndc_fixtures.json
 */

declare(strict_types=1);

require_once __DIR__ . '/../../src/Rndc/RndcClient.php';

$rndc = new RndcClient('miUsuario', 'miClave&<>', 'pruebas', '', 30);

// A tercero with characters that exercise XML escaping and non-ASCII (ñ, á).
$terceroVars = [
    'NUMNITEMPRESATRANSPORTE'  => '900123456',
    'CODTIPOIDTERCERO'         => 'N',
    'NUMIDTERCERO'             => '800555111',
    'NOMIDTERCERO'             => 'Transportes Peña & Cía <S.A.>',
    'PRIMERAPELLIDOIDTERCERO'  => "O'Brien",
    'SEGUNDOAPELLIDOIDTERCERO' => null,   // omitted (empty)
    'REGIMENSIMPLE'            => '',      // omitted (empty)
    'NOMENCLATURADIRECCION'    => 'Cra 7 # 12-34',
    'CODMUNICIPIORNDC'         => '11001000',
    'LATITUD'                  => '4.60971230',
    'LONGITUD'                 => '-74.08175000',
];

$xmlInterno = $rndc->construirXmlInterno(RndcClient::TIPO_INGRESAR, 11, $terceroVars);
$sobre      = $rndc->construirSobreSoap($xmlInterno);
$sobreIso   = mb_convert_encoding($sobre, 'ISO-8859-1', 'UTF-8');

$variablesFrag = '<CONSECUTIVOREMESA>0000000001</CONSECUTIVOREMESA>'
    . '<REMESASMAN procesoid="43"><REMESA><CONSECUTIVOREMESA>REM-00001</CONSECUTIVOREMESA></REMESA></REMESASMAN>';

$consulta = $rndc->construirXmlConsulta(
    RndcClient::TIPO_CONSULTAR_PROCESO,
    4,
    ['INGRESOID', 'FECHAING', 'SEGURIDADOR'],
    ['NUMNITEMPRESATRANSPORTE' => "'900123456'", 'NUMMANIFIESTOCARGA' => "'MAN-00001'"],
    []
);

$fixtures = [
    'construirXmlInterno' => [
        'input' => ['tipo' => '1', 'procesoid' => 11, 'variables' => $terceroVars],
        'output' => $xmlInterno,
    ],
    'construirSobreSoap' => [
        'input' => ['xmlInterno' => $xmlInterno],
        'output' => $sobre,
    ],
    'sobreSoapIso88591Base64' => [
        'input' => ['xmlInterno' => $xmlInterno],
        'output' => base64_encode($sobreIso),
    ],
    'previewXmlInterno' => [
        'input' => ['procesoid' => 4, 'variablesXml' => $variablesFrag],
        'output' => $rndc->previewXmlInterno(4, $variablesFrag),
    ],
    'renderVariables' => [
        'input' => ['vars' => $terceroVars],
        'output' => RndcClient::renderVariables($terceroVars),
    ],
    'construirXmlConsulta' => [
        'input' => [
            'tipo' => '3',
            'procesoid' => 4,
            'campos' => ['INGRESOID', 'FECHAING', 'SEGURIDADOR'],
            'filtro' => ['NUMNITEMPRESATRANSPORTE' => "'900123456'", 'NUMMANIFIESTOCARGA' => "'MAN-00001'"],
            'rango' => [],
        ],
        'output' => $consulta,
    ],
    'escaparXml' => [
        'input' => ['valor' => "a & b < c > d ' e \" f ñ á"],
        'output' => RndcClient::escaparXml("a & b < c > d ' e \" f ñ á"),
    ],
];

file_put_contents(
    __DIR__ . '/rndc_fixtures.json',
    json_encode($fixtures, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT)
);
echo "Wrote rndc_fixtures.json\n";
