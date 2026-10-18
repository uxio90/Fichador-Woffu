// Cliente mínimo de la API (no pública) de Woffu, la misma que usa su web.

const APP = "https://app.woffu.com/api";

export class ErrorWoffu extends Error {}

async function peticion(url, { metodo = "GET", token, cabeceras = {}, cuerpo } = {}) {
  let res;
  try {
    res = await fetch(url, {
      method: metodo,
      headers: {
        Accept: "application/json",
        ...(token && { Authorization: `Bearer ${token}` }),
        ...cabeceras,
      },
      body: cuerpo,
      signal: AbortSignal.timeout(30_000),
    });
  } catch (err) {
    if (err.name === "TimeoutError") throw new ErrorWoffu(`Woffu no responde (${new URL(url).pathname}).`);
    throw new ErrorWoffu(`No se puede conectar con Woffu (${err.cause?.code ?? err.message}). ¿Hay internet?`);
  }
  return res;
}

async function json(url, opciones) {
  const res = await peticion(url, opciones);
  if (!res.ok) {
    const texto = await res.text().catch(() => "");
    throw new ErrorWoffu(`Woffu respondió ${res.status} en ${new URL(url).pathname} ${texto.slice(0, 200)}`.trim());
  }
  const texto = await res.text();
  return texto ? JSON.parse(texto) : null;
}

// "miempresa" o "miempresa.woffu.com" -> "https://miempresa.woffu.com"
export function direccionEmpresa(dominio) {
  let d = String(dominio ?? "").trim().toLowerCase();
  d = d.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  if (!d || /[/@: ]/.test(d)) return null;
  if (!d.includes(".")) d += ".woffu.com";
  return d.endsWith(".woffu.com") ? `https://${d}` : null;
}

export async function login({ email, password, empresa }) {
  const cfg = await json(
    `${APP}/svc/accounts/companies/login-configuration-by-email?email=${encodeURIComponent(email)}`,
  ).catch((err) => {
    if (/ 40[04] /.test(err.message)) throw new ErrorWoffu(`Woffu no reconoce el email ${email}.`);
    throw err;
  });

  if (cfg?.woffuLogin === false) {
    throw new ErrorWoffu(
      "Tu empresa solo permite entrar en Woffu con Google/Microsoft (SSO), no con contraseña. Este programa no funciona en ese caso.",
    );
  }

  const direccion = direccionEmpresa(empresa) ?? direccionEmpresa(cfg?.domain);
  if (!direccion) throw new ErrorWoffu("No he podido averiguar la dirección de Woffu de tu empresa.");

  const res = await peticion(`${APP}/svc/accounts/authorization/token`, {
    metodo: "POST",
    cabeceras: { "Content-Type": "application/x-www-form-urlencoded", Origin: "https://app.woffu.com" },
    cuerpo: new URLSearchParams({ grant_type: "password", username: email, password }),
  });
  if (res.status === 400 || res.status === 401) throw new ErrorWoffu("Contraseña incorrecta.");
  if (!res.ok) throw new ErrorWoffu(`Woffu respondió ${res.status} al iniciar sesión.`);

  const cookies = res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  const { token } = await json(`${direccion}/api/svc/accounts/authorization/users/token`, {
    cabeceras: { Cookie: cookies },
  });
  if (!token) throw new ErrorWoffu("Woffu no devolvió la sesión de la empresa.");

  return { token, empresa: direccion };
}

export async function usuario({ token, empresa }) {
  return json(`${empresa}/api/users`, { token });
}

// Laborable = no es fin de semana, festivo, evento de calendario ni ausencia (vacaciones, baja...).
export async function diaDeHoy({ token, empresa }, fecha) {
  const desde = `${Number(fecha.slice(0, 4)) - 1}-12-31T23:00:00.000Z`;
  const dias = await json(`${empresa}/api/users/calendar-events?fromDate=${encodeURIComponent(desde)}`, { token });
  const dia = dias?.find((d) => d.Date?.startsWith(fecha));

  if (!dia) return { laborable: false, motivo: "Woffu no tiene el día de hoy en tu calendario" };
  if (dia.IsWeekend) return { laborable: false, motivo: "fin de semana" };
  if (dia.Calendar?.HasHoliday) {
    return { laborable: false, motivo: `festivo (${dia.Calendar.HolidayNames?.join(", ") || "sin nombre"})` };
  }
  if (dia.Event?.AbsenceEvents?.length) return { laborable: false, motivo: "ausencia o vacaciones en Woffu" };
  if (dia.Calendar?.HasEvent) {
    return { laborable: false, motivo: `evento en el calendario (${dia.Calendar.EventNames?.join(", ") || "sin nombre"})` };
  }
  return { laborable: true };
}

export async function fichajes({ token, empresa }) {
  return (await json(`${empresa}/api/signs`, { token })) ?? [];
}

// Estado según los fichajes que devuelve Woffu. TrueDate es la hora local ("2026-10-19T09:01:00").
export function estado(fichajes, fecha) {
  const ultimo = fichajes.at(-1);
  const deHoy = fichajes.filter((f) => !f.TrueDate || f.TrueDate.startsWith(fecha));
  return {
    dentro: ultimo?.SignIn === true,
    // Woffu alterna entrada/salida a partir del último fichaje, aunque sea de otro día
    entradaSinCerrar: ultimo?.SignIn === true && Boolean(ultimo.TrueDate) && !ultimo.TrueDate.startsWith(fecha),
    cantidad: deHoy.length,
    horas: deHoy.map((f) => f.TrueDate?.slice(11, 16)).filter(Boolean),
  };
}

// Woffu decide si es entrada o salida según el último fichaje (como el botón de su web)
export async function fichar({ token, empresa }, userId, timezoneOffset) {
  await json(`${empresa}/api/svc/signs/signs`, {
    metodo: "POST",
    token,
    cabeceras: { "Content-Type": "application/json" },
    cuerpo: JSON.stringify({
      agreementEventId: null,
      deviceId: "WebApp",
      requestId: null,
      timezoneOffset,
      UserId: userId,
    }),
  });
}
