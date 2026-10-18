# Quita la tarea programada. Se lanza con doble clic en desinstalar.cmd.
param([switch] $Elevado)

$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host "  Windows te va a pedir permiso de administrador para quitar la tarea."
    try {
        $p = Start-Process powershell -Verb RunAs -Wait -PassThru `
            -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`" -Elevado"
        exit $p.ExitCode
    } catch {
        Write-Host "  No se dio permiso de administrador; la tarea sigue activa." -ForegroundColor Yellow
        exit 1
    }
}

if (Get-ScheduledTask -TaskName "Fichador Woffu" -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName "Fichador Woffu" -Confirm:$false
    Write-Host "  Listo: ya no se fichará automáticamente." -ForegroundColor Green
} else {
    Write-Host "  No había ninguna tarea instalada."
}
Write-Host "  Tu configuración (config.json) sigue en la carpeta por si quieres volver a instalarlo."
if ($Elevado) { Read-Host "  Pulsa Enter para cerrar" }
