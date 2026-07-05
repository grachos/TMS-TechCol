# ==========================================================
#  Light TMS - Configuración
#  Copia este archivo como ".env" y completa los valores.
#  NO subas el archivo ".env" al repositorio.
# ==========================================================

# --- Aplicación ---
APP_NAME="Light TMS"
APP_ENV=local            # local | produccion
APP_DEBUG=true           # true en local, false en producción

# --- Base de datos (MariaDB / MySQL de Hostinger) ---
# En Hostinger estos datos salen de hPanel > Bases de datos MySQL
DB_HOST=localhost
DB_PORT=3306
DB_NAME=light_tms
DB_USER=root
DB_PASS=
DB_CHARSET=utf8mb4

# --- Acceso al web service del RNDC (bloque <acceso>) ---
# Lo entrega el Ministerio de Transporte a la empresa.
# Ambiente: "pruebas" (servidor rndc) o "produccion" (rndcws/rndcws2/plc).
RNDC_AMBIENTE=pruebas
RNDC_USERNAME=
RNDC_PASSWORD=
# NIT/empresa con la que se autentica ante el RNDC
RNDC_EMPRESA=
# Override opcional del host base (solo si el RNDC cambia de URL)
RNDC_HOST_OVERRIDE=
RNDC_TIMEOUT=30

# --- Cola offline / reintentos ---
COLA_MAX_INTENTOS=10          # intentos antes de marcar como "error"
COLA_MINUTOS_REINTENTO=15     # espera entre reintentos
# Interruptor de seguridad: si es false (por defecto) el worker arma y
# previsualiza el XML pero NO lo envía al RNDC. Ponlo en true para enviar de verdad.
COLA_ENVIO_HABILITADO=false
