import { test } from "node:test";
import assert from "node:assert/strict";
import { leerHorario, leerMargen, ahoraEn, decidir, hayQueFichar } from "../src/horario.js";
import * as woffu from "../src/woffu.js";

const horario = ["09:00", "14:00", "15:00", "18:00"];

test("offset de Madrid en invierno y en verano", () => {
  const invierno = ahoraEn("Europe/Madrid", new Date("2026-01-15T08:00:00Z"));
  assert.equal(invierno.hora, "09:00");
  assert.equal(invierno.timezoneOffset, -60);

  const verano = ahoraEn("Europe/Madrid", new Date("2026-07-15T07:00:00Z"));
  assert.equal(verano.hora, "09:00");
  assert.equal(verano.timezoneOffset, -120);
  assert.equal(verano.finDeSemana, false);
  assert.equal(ahoraEn("Europe/Madrid", new Date("2026-10-18T10:00:00Z")).finDeSemana, true);
});

test("normaliza y valida el horario", () => {
  assert.deepEqual(leerHorario("9:00, 14:00 15:00,18:00,"), horario);
  assert.deepEqual(leerHorario(["8:30", "18:00"]), ["08:30", "18:00"]);
  assert.throws(() => leerHorario("09:00 14:00 15:00"), /número par/);
  assert.throws(() => leerHorario("09:00 25:00"), /no válida/);
  assert.throws(() => leerHorario("9h 14h"), /no válida/);
  assert.throws(() => leerHorario("22:00 06:00"), /medianoche/);
  assert.throws(() => leerHorario("09:00 09:00"), /en orden/);
});

test("valida el margen", () => {
  assert.equal(leerMargen(), 60);
  assert.equal(leerMargen("30"), 30);
  assert.throws(() => leerMargen("una hora"), /entre 5 y 240/);
  assert.throws(() => leerMargen(-5), /entre 5 y 240/);
});

test("no deshace fichajes manuales", () => {
  const nueve = decidir({ horario, hora: "09:30", margen: 60 });
  // No ha fichado nada: entrada
  assert.equal(hayQueFichar(nueve, { dentro: false, horas: [] }), true);
  // Fichó a mano a las 08:55: ya está dentro
  assert.equal(hayQueFichar(nueve, { dentro: true, horas: ["08:55"] }), false);
  // Entró a las 09:00 y salió a mano a las 09:20 (se encontraba mal): no lo vuelve a meter
  assert.equal(hayQueFichar(nueve, { dentro: false, horas: ["09:00", "09:20"] }), false);
  // Fuera de la ventana de fichar
  assert.equal(hayQueFichar(decidir({ horario, hora: "11:00", margen: 60 }), { dentro: false, horas: [] }), false);
});

test("solo ficha cerca de cada hora del horario", () => {
  assert.deepEqual(decidir({ horario, hora: "08:59", margen: 60 }), {
    debeEstarDentro: false,
    hora: null,
    siguiente: "09:00",
  });
  assert.equal(decidir({ horario, hora: "09:00", margen: 60 }).hora, "09:00");
  assert.equal(decidir({ horario, hora: "09:00", margen: 60 }).debeEstarDentro, true);
  assert.equal(decidir({ horario, hora: "10:01", margen: 60 }).hora, null);
  assert.equal(decidir({ horario, hora: "14:20", margen: 60 }).debeEstarDentro, false);
  assert.equal(decidir({ horario, hora: "15:10", margen: 60 }).hora, "15:00");
  // Equipo encendido a las 18:30 sin haber fichado en todo el día: solo la hora en curso
  assert.deepEqual(decidir({ horario, hora: "18:30", margen: 60 }), {
    debeEstarDentro: false,
    hora: "18:00",
    siguiente: null,
  });
});

test("dirección de la empresa", () => {
  assert.equal(woffu.direccionEmpresa("acme"), "https://acme.woffu.com");
  assert.equal(woffu.direccionEmpresa("https://Acme.woffu.com/"), "https://acme.woffu.com");
  assert.equal(woffu.direccionEmpresa("evil.com"), null);
  assert.equal(woffu.direccionEmpresa(""), null);
});

test("login: descubre la empresa y canjea la cookie por el token", async (t) => {
  const llamadas = [];
  t.mock.method(globalThis, "fetch", async (url, init) => {
    llamadas.push([init.method, url]);
    if (url.includes("login-configuration-by-email")) return Response.json({ domain: "acme", woffuLogin: true });
    if (url.endsWith("/svc/accounts/authorization/token")) {
      assert.equal(init.body.get("password"), "p#ss");
      return new Response("", { headers: [["Set-Cookie", "woffu.token=abc; Path=/; HttpOnly"]] });
    }
    if (url === "https://acme.woffu.com/api/svc/accounts/authorization/users/token") {
      assert.equal(init.headers.Cookie, "woffu.token=abc");
      return Response.json({ token: "T" });
    }
    throw new Error(`inesperado ${url}`);
  });

  assert.deepEqual(await woffu.login({ email: "ana@acme.com", password: "p#ss" }), {
    token: "T",
    empresa: "https://acme.woffu.com",
  });
  assert.equal(llamadas.length, 3);
});

test("login: errores comprensibles", async (t) => {
  t.mock.method(globalThis, "fetch", async (url) =>
    url.includes("login-configuration") ? Response.json({ domain: "acme", woffuLogin: false }) : null,
  );
  await assert.rejects(woffu.login({ email: "a@b.c", password: "x" }), /SSO/);

  t.mock.method(globalThis, "fetch", async (url) =>
    url.includes("login-configuration") ? Response.json({ domain: "acme" }) : new Response("", { status: 400 }),
  );
  await assert.rejects(woffu.login({ email: "a@b.c", password: "x" }), /Contraseña incorrecta/);
});

test("día de hoy: detecta vacaciones y festivos", async (t) => {
  const sesion = { token: "T", empresa: "https://acme.woffu.com" };
  const dias = [
    { Date: "2026-10-19T00:00:00", IsWeekend: false, Calendar: {}, Event: { AbsenceEvents: [] } },
    { Date: "2026-10-20T00:00:00", IsWeekend: false, Calendar: {}, Event: { AbsenceEvents: [{}] } },
    { Date: "2026-10-12T00:00:00", IsWeekend: false, Calendar: { HasHoliday: true, HolidayNames: ["Pilar"] }, Event: {} },
  ];
  t.mock.method(globalThis, "fetch", async () => Response.json(dias));

  assert.deepEqual(await woffu.diaDeHoy(sesion, "2026-10-19"), { laborable: true });
  assert.match((await woffu.diaDeHoy(sesion, "2026-10-20")).motivo, /vacaciones/);
  assert.match((await woffu.diaDeHoy(sesion, "2026-10-12")).motivo, /Pilar/);
  assert.equal((await woffu.diaDeHoy(sesion, "2026-10-21")).laborable, false);
});

test("estado a partir de los fichajes", () => {
  const hoy = woffu.estado(
    [
      { SignIn: true, TrueDate: "2026-10-16T09:00:00" },
      { SignIn: false, TrueDate: "2026-10-16T18:00:00" },
      { SignIn: true, TrueDate: "2026-10-19T09:01:00" },
    ],
    "2026-10-19",
  );
  assert.deepEqual(hoy, { dentro: true, entradaSinCerrar: false, cantidad: 1, horas: ["09:01"] });
  assert.equal(woffu.estado([], "2026-10-19").dentro, false);

  // El viernes se olvidó de fichar la salida
  const abierto = woffu.estado([{ SignIn: true, TrueDate: "2026-10-16T09:00:00" }], "2026-10-19");
  assert.equal(abierto.entradaSinCerrar, true);
  assert.equal(abierto.cantidad, 0);
});
