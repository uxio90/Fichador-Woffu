// Lógica de horario: sin red ni ficheros, para poder probarla.

export const HORARIO_POR_DEFECTO = ["09:00", "14:00", "15:00", "18:00"];

const HORA = /^(\d{1,2}):(\d{2})$/;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

// "9:00 14:00, 15:00 18:00" o ["9:00", ...] -> ["09:00", "14:00", "15:00", "18:00"]
export function leerHorario(valor) {
  const lista = (Array.isArray(valor) ? valor : String(valor).split(/[\s,;]+/))
    .map((h) => String(h).trim())
    .filter(Boolean);

  const horario = lista.map((h) => {
    const m = HORA.exec(h);
    if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) {
      throw new Error(`Hora no válida en el horario: "${h}". Usa el formato 09:00.`);
    }
    return `${m[1].padStart(2, "0")}:${m[2]}`;
  });

  if (horario.length === 0 || horario.length % 2 !== 0) {
    throw new Error("El horario necesita un número par de horas: entrada, salida, entrada, salida...");
  }
  // Sin ordenar: un turno de noche (22:00 06:00) se rechaza en vez de invertirse
  if (horario.some((h, i) => i > 0 && h <= horario[i - 1])) {
    throw new Error("Las horas deben ir en orden y dentro del mismo día (no vale cruzar la medianoche).");
  }
  return horario;
}

export function leerMargen(valor = 60) {
  const margen = Number(valor);
  if (!Number.isInteger(margen) || margen < 5 || margen > 240) {
    throw new Error(`margenMinutos debe ser un número entero entre 5 y 240 (ahora es "${valor}").`);
  }
  return margen;
}

// ["2026-12-24"] o "24/12/2026 31/12/2026" -> ["2026-12-24", "2026-12-31"]
export function leerFechas(valor = []) {
  const lista = Array.isArray(valor) ? valor : String(valor).split(/[\s,;]+/).filter(Boolean);
  return lista.map((f) => {
    const dma = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(f);
    const fecha = dma ? `${dma[3]}-${dma[2].padStart(2, "0")}-${dma[1].padStart(2, "0")}` : f;
    if (!FECHA.test(fecha)) throw new Error(`Fecha no válida en los días sin fichar: "${f}". Usa el formato 24/12/2026.`);
    return fecha;
  });
}

export function minutos(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

// Fecha, hora, día de la semana y offset actuales en una zona horaria
export function ahoraEn(timeZone, date = new Date()) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      weekday: "short",
      hourCycle: "h23",
      timeZoneName: "longOffset",
    })
      .formatToParts(date)
      .map((x) => [x.type, x.value]),
  );
  // "GMT+02:00" -> +120; "GMT" -> 0
  const offset = p.timeZoneName.replace("GMT", "") || "+00:00";
  const offsetMin = (offset[0] === "-" ? -1 : 1) * (Number(offset.slice(1, 3)) * 60 + Number(offset.slice(4, 6)));

  return {
    fecha: `${p.year}-${p.month}-${p.day}`,
    hora: `${p.hour}:${p.minute}`,
    finDeSemana: p.weekday === "Sat" || p.weekday === "Sun",
    // Woffu usa el convenio de getTimezoneOffset(): UTC+2 -> -120
    timezoneOffset: -offsetMin,
  };
}

// Qué toca según el horario. `hora` solo es "de fichar" durante los `margen` minutos
// siguientes a una hora del horario: si el equipo estaba apagado, no se ficha a destiempo.
export function decidir({ horario, hora, margen }) {
  const pasadas = horario.filter((h) => h <= hora);
  const ultima = pasadas.at(-1);
  const enHora = ultima !== undefined && minutos(hora) - minutos(ultima) <= margen;

  return {
    debeEstarDentro: pasadas.length % 2 === 1,
    hora: enHora ? ultima : null,
    siguiente: horario.find((h) => h > hora) ?? null,
  };
}

// `horas`: horas de los fichajes de hoy. Si ya se fichó desde la hora en curso (a mano o por
// nosotros), no se vuelve a fichar: así nunca se deshace un fichaje manual.
export function hayQueFichar(decision, { dentro, horas }) {
  if (!decision.hora || dentro === decision.debeEstarDentro) return false;
  return !horas.some((h) => h >= decision.hora);
}
