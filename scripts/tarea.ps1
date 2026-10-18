# Registra la tarea programada. Lo lanza asistente.ps1 con permisos de administrador.
param(
    [Parameter(Mandatory)] [string] $Raiz,
    [Parameter(Mandatory)] [string] $Node,
    [Parameter(Mandatory)] [string] $Usuario,
    [Parameter(Mandatory)] [string] $Inicio,
    [Parameter(Mandatory)] [int] $Minutos
)

$ErrorActionPreference = "Stop"
try {
    $comando = "`"`"$Node`" `"$Raiz\src\index.js`" >> `"$Raiz\fichador.log`" 2>&1`""
    $accion = New-ScheduledTaskAction -Execute "cmd.exe" -Argument "/c $comando" -WorkingDirectory $Raiz

    $disparador = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday, Tuesday, Wednesday, Thursday, Friday -At $Inicio
    $disparador.Repetition = (New-ScheduledTaskTrigger -Once -At $Inicio `
            -RepetitionInterval (New-TimeSpan -Minutes 15) `
            -RepetitionDuration (New-TimeSpan -Minutes $Minutos)).Repetition

    $ajustes = New-ScheduledTaskSettingsSet -StartWhenAvailable -WakeToRun -AllowStartIfOnBatteries `
        -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 5) -MultipleInstances IgnoreNew

    # S4U: funciona aunque no hayas iniciado sesión y sin abrir ventanas
    $principal = New-ScheduledTaskPrincipal -UserId $Usuario -LogonType S4U -RunLevel Limited

    Register-ScheduledTask -TaskName "Fichador Woffu" -Action $accion -Trigger $disparador -Settings $ajustes `
        -Principal $principal -Force | Out-Null
} catch {
    Write-Host "Error al programar la tarea: $($_.Exception.Message)" -ForegroundColor Red
    Read-Host "Pulsa Enter para cerrar"
    exit 1
}
