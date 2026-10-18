// Uso:
//   node src/index.js                  lo lanza el Programador de tareas cada 15 min; ficha si toca
//   node src/index.js --prueba         comprueba la conexión y enseña qué haría, sin fichar nunca
//   node src/index.js --horario "..."  valida un horario y lo devuelve normalizado (para el asistente)

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { setTimeout as esperar } from "node:timers/promises";
import {
  HORARIO_POR_DEFECTO,
  leerHorario,
  leerFechas,
  leerMargen,
  ahoraEn,
  decidir,
  hayQueFichar,
} from "./horario.js";
import * as woffu from "./woffu.js";

const RUTA_CONFIG = fileURLToPath(new URL("../config.json", import.meta.url));

function log(mensaje) {
  console.log(`[${new Date().toLocaleString("es-ES")}] ${mensaje}`);
}

// En Windows la configuración está en config.json; en GitHub Actions, en variables de entorno
function leerJsonConfig() {
  try {
    return JSON.parse(readFileSync(RUTA_CONFIG, "utf8").replace(/^﻿/, ""));
  } catch (err) {
    if (err.code === "ENOENT") return null;
    throw new Error(`config.json está dañado (${err.message}). Ejecuta instalar.cmd.`);
  }
}

function configDeEntorno(env) {
  if (!env.WOFFU_EMAIL && !env.WOFFU_PASSWORD) {
    throw new Error("No encuentro config.json. Ejecuta instalar.cmd para configurar el programa.");
  }
  return {
    email: env.WOFFU_EMAIL,
    password: env.WOFFU_PASSWORD,
    horario: env.HORARIO || undefined,
    vacaciones: env.DIAS_SIN_FICHAR || undefined,
    margenMinutos: env.MARGEN_MINUTOS || undefined,
    zonaHoraria: env.ZONA_HORARIA || undefined,
  };
}

function leerConfig(c) {
  if (!c.email || !c.password) {
    throw new Error("Faltan el email o la contraseña (instalar.cmd en Windows, o los secrets en GitHub).");
  }

  const zonaHoraria = c.zonaHoraria || "Europe/Madrid";
  try {
    new Intl.DateTimeFormat("es", { timeZone: zonaHoraria });
  } catch {
    throw new Error(`Zona horaria no válida en config.json: "${zonaHoraria}".`);
  }

  return {
    ...c,
    zonaHoraria,
    horario: leerHorario(c.horario ?? HORARIO_POR_DEFECTO),
    vacaciones: leerFechas(c.vacaciones),
    margen: leerMargen(c.margenMinutos),
  };
}

async function main(prueba) {
  const crudo = leerJsonConfig();
  const config = leerConfig(crudo ?? configDeEntorno(process.env));
  const ahora = ahoraEn(config.zonaHoraria);
  const decision = decidir({ horario: config.horario, hora: ahora.hora, margen: config.margen });
  const deVacaciones = config.vacaciones.includes(ahora.fecha);

  // Fuera de hora no hace falta ni conectarse
  if (!prueba && (ahora.finDeSemana || deVacaciones || !decision.hora)) return;

  const sesion = await woffu.login(config);
  if (crudo && crudo.empresa !== sesion.empresa) {
    writeFileSync(RUTA_CONFIG, JSON.stringify({ ...crudo, empresa: sesion.empresa }, null, 2));
  }
  const [yo, dia, fichajes] = await Promise.all([
    woffu.usuario(sesion),
    woffu.diaDeHoy(sesion, ahora.fecha),
    woffu.fichajes(sesion),
  ]);
  const estado = woffu.estado(fichajes, ahora.fecha);
  const toca = dia.laborable && !deVacaciones && hayQueFichar(decision, estado);

  if (prueba) {
    const hoy = deVacaciones ? "día sin fichar (puesto en el asistente)" : dia.laborable ? "laborable" : dia.motivo;
    console.log("");
    console.log(`  Conectado a ${sesion.empresa} como ${yo.FullName ?? config.email}.`);
    console.log(`  Horario: ${config.horario.join(", ")}`);
    console.log(`  Hoy ${ahora.fecha}: ${hoy}.`);
    console.log(
      `  Fichajes de hoy en Woffu: ${estado.horas.join(", ") || estado.cantidad}. Ahora estás ${estado.dentro ? "DENTRO" : "FUERA"}.`,
    );
    if (estado.entradaSinCerrar) console.log("  AVISO: tienes una entrada de otro día sin salida. Corrígela en Woffu.");
    console.log(
      toca && !estado.entradaSinCerrar
        ? `  Si no fuera una prueba, ahora ficharía la ${estado.dentro ? "SALIDA" : "ENTRADA"} de las ${decision.hora}.`
        : `  Ahora no toca fichar.${decision.siguiente ? ` Próxima hora del horario: ${decision.siguiente}.` : ""}`,
    );
    console.log("");
    return;
  }

  if (!toca) return;
  if (estado.entradaSinCerrar) {
    throw new Error("Hay una entrada de otro día sin salida, así que Woffu ficharía al revés. Corrígela en Woffu.");
  }

  await woffu.fichar(sesion, yo.UserId, ahora.timezoneOffset);

  // Woffu a veces acepta el fichaje sin guardarlo: lo comprobamos
  for (let intento = 0; intento < 4; intento++) {
    await esperar(2000);
    if (woffu.estado(await woffu.fichajes(sesion), ahora.fecha).dentro !== estado.dentro) {
      log(`${estado.dentro ? "Salida" : "Entrada"} fichada (horario de las ${decision.hora}).`);
      return;
    }
  }
  throw new Error(`Woffu aceptó el fichaje de las ${decision.hora} pero no aparece. Revísalo en Woffu.`);
}

const args = process.argv.slice(2);
const prueba = args.includes("--prueba");

if (args[0] === "--horario") {
  try {
    console.log(JSON.stringify(leerHorario(args[1]?.trim() ? args[1] : HORARIO_POR_DEFECTO)));
  } catch (err) {
    console.log(err.message); // por stdout: PowerShell 5.1 trata stderr como excepción
    process.exitCode = 1;
  }
} else {
  main(prueba).catch((err) => {
    if (prueba) console.error(`\n  ERROR: ${err.message}\n`);
    else log(`ERROR: ${err.message}`);
    process.exitCode = 1;
  });
}
