# Asistente de instalación. Se lanza con doble clic en instalar.cmd.
# Compatible con Windows PowerShell 5.1 (el que trae Windows).

$ErrorActionPreference = "Stop"
$raiz = Split-Path $PSScriptRoot -Parent
$rutaConfig = Join-Path $raiz "config.json"
$programa = Join-Path $raiz "src\index.js"

# Los archivos descargados de internet vienen "bloqueados" por Windows
Get-ChildItem $raiz -Recurse -File | Unblock-File

function Titulo($texto) {
    Write-Host ""
    Write-Host " $texto " -ForegroundColor Black -BackgroundColor Cyan
    Write-Host ""
}

function Preguntar($texto, $defecto) {
    if ($defecto) { $texto = "$texto [$defecto]" }
    $r = Read-Host "  $texto"
    if ([string]::IsNullOrWhiteSpace($r)) { return $defecto }
    return $r.Trim()
}

function Fallo($texto) {
    Write-Host ""
    Write-Host "  $texto" -ForegroundColor Red
    Write-Host ""
    exit 1
}

function Buscar-Node {
    $candidatos = @()
    $cmd = Get-Command node -ErrorAction SilentlyContinue
    if ($cmd) { $candidatos += $cmd.Source }
    $candidatos += Join-Path $env:ProgramFiles "nodejs\node.exe"
    foreach ($ruta in $candidatos) {
        if (Test-Path $ruta) {
            $version = (& $ruta -v).TrimStart("v")
            if ([int]$version.Split(".")[0] -ge 24) { return $ruta }
            Write-Host "  Tienes Node.js $version y hace falta la 24 o superior." -ForegroundColor Yellow
        }
    }
    return $null
}

function Leer-Config {
    if (Test-Path $rutaConfig) { return Get-Content $rutaConfig -Raw -Encoding UTF8 | ConvertFrom-Json }
    return New-Object PSObject
}

function Poner($objeto, $nombre, $valor) {
    $objeto | Add-Member -NotePropertyName $nombre -NotePropertyValue $valor -Force
}

function Guardar-Config($config) {
    $json = $config | ConvertTo-Json -Depth 5
    [IO.File]::WriteAllText($rutaConfig, $json, (New-Object Text.UTF8Encoding $false))
    # Solo tu usuario puede leerlo: contiene tu contraseña
    icacls $rutaConfig /inheritance:r /grant:r "$($env:USERDOMAIN)\$($env:USERNAME):(F)" | Out-Null
}

function Normalizar-Fechas($texto) {
    $resultado = @()
    foreach ($f in @($texto -split "[\s,;]+" | Where-Object { $_ })) {
        if ($f -match "^(\d{1,2})/(\d{1,2})/(\d{4})$") {
            $resultado += "{0}-{1:D2}-{2:D2}" -f $matches[3], [int]$matches[2], [int]$matches[1]
        } elseif ($f -match "^\d{4}-\d{2}-\d{2}$") {
            $resultado += $f
        } else {
            return $null
        }
    }
    return , $resultado
}

function Minutos($hhmm) {
    $p = $hhmm.Split(":")
    return [int]$p[0] * 60 + [int]$p[1]
}

Clear-Host
Write-Host ""
Write-Host "  FICHADOR WOFFU - instalación" -ForegroundColor Cyan
Write-Host "  Ficha por ti en Woffu a tus horas, de lunes a viernes."

# 1. Node.js -----------------------------------------------------------------
Titulo "1/4  Node.js"
$node = Buscar-Node
if (-not $node) {
    $r = Preguntar "Hace falta instalar Node.js. ¿Lo instalo ahora? (S/N)" "S"
    if ($r -notmatch "^[sSyY]") { Fallo "Instálalo desde https://nodejs.org y vuelve a abrir instalar.cmd." }
    winget install --id OpenJS.NodeJS.LTS --exact --silent --accept-source-agreements --accept-package-agreements
    $node = Buscar-Node
    if (-not $node) { Fallo "No se pudo instalar Node.js. Instálalo desde https://nodejs.org y vuelve a abrir instalar.cmd." }
}
Write-Host "  Node.js OK ($(& $node -v))." -ForegroundColor Green

# 2. Cuenta de Woffu ---------------------------------------------------------
Titulo "2/4  Tu cuenta de Woffu"
while ($true) {
    $config = Leer-Config
    $email = Preguntar "Email con el que entras en Woffu" $config.email
    $pista = ""
    if ($config.password) { $pista = "; Enter para dejar la actual" }
    $seguro = Read-Host "  Contraseña de Woffu (no se ve al escribir$pista)" -AsSecureString
    $password = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($seguro))
    if (-not $password) { $password = $config.password }
    if (-not $email -or -not $password) { Write-Host "  Hacen falta el email y la contraseña." -ForegroundColor Yellow; continue }

    # Se conservan los demás ajustes que ya hubiera en config.json
    if ($config.email -ne $email) { Poner $config "empresa" $null }
    Poner $config "email" $email
    Poner $config "password" $password
    if (-not $config.margenMinutos) { Poner $config "margenMinutos" 60 }
    if (-not $config.zonaHoraria) { Poner $config "zonaHoraria" "Europe/Madrid" }
    Guardar-Config $config

    Write-Host "  Comprobando con Woffu..."
    & $node $programa --prueba
    if ($LASTEXITCODE -eq 0) { break }
    Write-Host "  Vuelve a intentarlo." -ForegroundColor Yellow
}

# 3. Horario -----------------------------------------------------------------
Titulo "3/4  Tu horario"
$config = Leer-Config
Write-Host "  Escribe las horas a las que fichas, en orden y separadas por espacios:"
Write-Host "  entrada, salida a comer, vuelta y salida. Por ejemplo: 09:00 14:00 15:00 18:00"
Write-Host "  Si no paras a comer, pon solo dos: 08:00 15:00"
$sugerido = (@($config.horario) | Where-Object { $_ }) -join " "
if (-not $sugerido) { $sugerido = (& $node $programa --horario) | ConvertFrom-Json | ForEach-Object { $_ } }
$sugerido = @($sugerido) -join " "
while ($true) {
    $salida = & $node $programa --horario (Preguntar "Horario" $sugerido)
    if ($LASTEXITCODE -eq 0) { $horario = @($salida | ConvertFrom-Json | ForEach-Object { $_ }); break }
    Write-Host "  $salida" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "  Las vacaciones, festivos y ausencias que tengas en Woffu ya se respetan solas."
Write-Host "  Si hay algún otro día en el que NO quieras que fiche, escríbelo (p. ej. 24/12/2026)."
$actuales = (@($config.vacaciones) | Where-Object { $_ }) -join " "
if ($actuales) { Write-Host "  Enter los deja como están; escribe NINGUNO para borrarlos." }
while ($true) {
    $texto = Preguntar "Días sin fichar" $actuales
    if ($texto -match "^ningun[oa]?$") { $texto = "" }
    $vacaciones = Normalizar-Fechas $texto
    if ($null -ne $vacaciones) { break }
    Write-Host "  No lo entiendo. Usa fechas como 24/12/2026 separadas por espacios." -ForegroundColor Yellow
}
Poner $config "horario" $horario
Poner $config "vacaciones" $vacaciones
Guardar-Config $config

# 4. Tarea programada --------------------------------------------------------
Titulo "4/4  Programar la tarea"
$inicio = $horario[0]
$duracion = (Minutos $horario[-1]) - (Minutos $inicio) + [int]$config.margenMinutos + 15
Write-Host "  Windows te va a pedir permiso de administrador para programar la tarea."
$argumentos = "-NoProfile -ExecutionPolicy Bypass -File `"$PSScriptRoot\tarea.ps1`" -Raiz `"$raiz`" -Node `"$node`" -Usuario `"$($env:USERDOMAIN)\$($env:USERNAME)`" -Inicio $inicio -Minutos $duracion"
try {
    $proceso = Start-Process powershell -Verb RunAs -ArgumentList $argumentos -Wait -PassThru
} catch {
    Fallo "No se dio permiso de administrador. Vuelve a abrir instalar.cmd cuando quieras."
}
if ($proceso.ExitCode -ne 0) { Fallo "No se pudo programar la tarea." }

Write-Host ""
Write-Host "  LISTO." -ForegroundColor Green
Write-Host "  Ficharé de lunes a viernes a las $($horario -join ', ')."
Write-Host "  El equipo tiene que estar encendido (o en suspensión) a esas horas."
Write-Host ""
Write-Host "  - ver-registro.cmd   lo que ha fichado y si ha habido errores"
Write-Host "  - probar.cmd         comprobar que todo va bien, sin fichar"
Write-Host "  - instalar.cmd       cambiar contraseña, horario o días sin fichar"
Write-Host "  - desinstalar.cmd    dejar de fichar"
Write-Host ""
