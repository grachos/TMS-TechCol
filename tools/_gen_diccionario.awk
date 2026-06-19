BEGIN {
    FS = "\t"
    np = split("11,12,3,4", order, ",")
    print "<?php"
    print "/**"
    print " * Light TMS - Diccionario de datos del RNDC (variables oficiales)."
    print " * GENERADO desde 'Maestro_Diccionario de Datos_RNDC.csv'. No editar a mano."
    print " *"
    print " * [procesoid => ['nombre'=>..., 'campos'=>[ [variable, requerido, tipo, tamano, etiqueta, orden], ... ]]]"
    print " * requerido: S=obligatorio, N=no, C=condicional."
    print " */"
    print ""
    print "declare(strict_types=1);"
    print ""
    print "return ["
}

function esc(s) {
    gsub(/\\/, "\\\\", s)
    gsub(/'/, "\\'", s)
    return s
}

NR > 1 && ($2 == "11" || $2 == "12" || $2 == "3" || $2 == "4") {
    p = $2
    if (!(p in name)) name[p] = $3
    c = ++cnt[p]
    ord[p, c]  = ($11 == "" ? 0 : $11) + 0
    var[p, c]  = $4
    req[p, c]  = $7
    tipo[p, c] = $6
    tam[p, c]  = $5
    etq[p, c]  = esc($10)
}

END {
    for (oi = 1; oi <= np; oi++) {
        p = order[oi]
        n = cnt[p]
        # insertion sort por orden (estable)
        for (i = 1; i <= n; i++) idx[i] = i
        for (i = 2; i <= n; i++) {
            k = idx[i]; j = i - 1
            while (j >= 1 && ord[p, idx[j]] > ord[p, k]) { idx[j+1] = idx[j]; j-- }
            idx[j+1] = k
        }
        printf "    %s => [\n", p
        printf "        'nombre' => '%s',\n", esc(name[p])
        print  "        'campos' => ["
        for (i = 1; i <= n; i++) {
            r = idx[i]
            printf "            ['%s', '%s', '%s', '%s', '%s', %d],\n", \
                var[p, r], req[p, r], tipo[p, r], tam[p, r], etq[p, r], ord[p, r]
        }
        print  "        ],"
        print  "    ],"
        delete idx
    }
    print "];"
}
