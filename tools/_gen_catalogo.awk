BEGIN { FS = "\t"; first = 1 }
function esc(s) { gsub(/'/, "''", s); return s }
NR == 1 { next }
{
    if ($(kc + 0) == "") next            # salta filas sin clave
    n = split(cols, c, ",")
    line = ""
    for (i = 1; i <= n; i++) {
        line = line (i > 1 ? "," : "") "'" esc($(c[i] + 0)) "'"
    }
    printf "%s(%s)", (first ? "" : ",\n"), line
    first = 0
}
END { print ";" }
