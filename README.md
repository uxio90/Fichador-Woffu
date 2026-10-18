# Fichador Woffu

Ficha por ti en **Woffu** a tus horas, de lunes a viernes, desde un PC con Windows.

- Se instala con un asistente: email, contraseña y horario. Nada de editar archivos.
- Respeta solo los **festivos, vacaciones y ausencias** que tengas en Woffu.
- Tiene en cuenta el **cambio de hora** de verano e invierno.
- Si el PC estaba apagado a la hora de fichar, **no ficha a destiempo**.
- Comprueba que Woffu ha guardado de verdad cada fichaje.

Inspirado en [ficheitor](https://github.com/elias-garcia/ficheitor) (2020), rehecho para 2026: el login nuevo de Woffu,
sin Heroku y sin dependencias. El login nuevo y el calendario de Woffu se basan en cómo los usa
[woffux](https://github.com/ngavilan-dogfy/woffux) (MIT).

## Instalación

1. **[Descarga el zip](https://github.com/uxio90/Fichador-Woffu/releases/latest/download/Fichador-Woffu.zip)** y
   descomprímelo en una carpeta que no vayas a borrar, por ejemplo `C:\Fichador-Woffu`.
2. Haz doble clic en **`instalar.cmd`** y responde a lo que te pregunta:
   - Si no tienes Node.js, te ofrece instalarlo.
   - Tu email y contraseña de Woffu. Comprueba en el momento que son correctos.
   - Tu horario, por ejemplo `09:00 14:00 15:00 18:00` (entrada, comida, vuelta y salida).
3. Windows te pedirá permiso de administrador para programar la tarea. Acepta.

Listo. A partir de ahí el PC ficha solo.

> Si Windows muestra "Windows protegió su PC" al abrir `instalar.cmd`, pulsa **Más información → Ejecutar de todas formas**.
> Pasa con cualquier script descargado de internet.

## Uso diario

| Archivo | Para qué |
| --- | --- |
| `ver-registro.cmd` | Ver qué ha fichado y si ha habido algún error |
| `probar.cmd` | Comprobar que todo va bien y qué haría ahora mismo, **sin fichar** |
| `instalar.cmd` | Cambiar la contraseña, el horario o los días sin fichar |
| `desinstalar.cmd` | Dejar de fichar automáticamente |

## Cómo funciona

Windows lanza el programa cada 15 minutos durante tu jornada. Cada vez:

1. Si no estás a menos de una hora de alguna hora de tu horario, no hace nada.
2. Entra en Woffu y mira si hoy es laborable para ti: no festivo, sin vacaciones ni ausencias.
3. Compara si estás dentro o fuera según Woffu con lo que dice tu horario. Si no coincide, ficha.

Así:

- Si fichas a mano antes de tiempo (entras a las 08:50), no ficha otra vez.
- Si fichas a mano después de la hora (te vas a las 09:20 porque te encuentras mal), no lo deshace.
- Si enciendes el PC a las 09:40, ficha la entrada a esa hora. Si lo enciendes a las 11:00, ya no ficha la de las
  09:00: tendrás que hacerlo a mano.
- Si un día anterior se quedó una entrada sin salida, no ficha (Woffu lo haría al revés) y te avisa en el registro.

No sirve para turnos de noche que cruzan la medianoche.

## Preguntas frecuentes

**¿Tiene que estar el PC encendido?** Sí, o en suspensión: la tarea lo despierta si está activado el
"Permitir temporizadores de reactivación" del plan de energía de Windows. Apagado no puede fichar.

**¿Dónde está mi contraseña?** En `config.json`, dentro de la carpeta del programa, y solo tu usuario de Windows
puede leer ese archivo. Solo se envía a Woffu.

**Mi empresa entra en Woffu con Google o Microsoft.** Entonces no funciona: necesita usuario y contraseña de Woffu.
El asistente te lo dirá.

**Ha dejado de funcionar.** Woffu no tiene una API pública: este programa usa la misma que su web y puede cambiar sin
avisar. Abre `ver-registro.cmd` para ver el error y [abre un issue](https://github.com/uxio90/Fichador-Woffu/issues).

## Aviso

En España el registro de jornada es obligatorio y debe reflejar las horas que trabajas de verdad. Usa este programa
para no olvidarte de fichar en tu horario real, no para fichar horas que no trabajas. Lo usas bajo tu responsabilidad.

## Para desarrolladores

Node.js 24, sin dependencias. `npm test` lanza las pruebas; `npm run prueba` es lo mismo que `probar.cmd`.

- `src/horario.js`: decide si toca fichar (lógica pura, probada).
- `src/woffu.js`: cliente de la API de Woffu (login, calendario, fichajes).
- `src/index.js`: lee `config.json` y une lo anterior.
- `scripts/`: asistente de instalación y tarea programada (PowerShell 5.1).
