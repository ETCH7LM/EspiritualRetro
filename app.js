import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./supabase-config.js";

const $ = (s) => document.querySelector(s);
const TIPOS = {
  milagro: { icono: "🕊️", nombre: "Milagro" },
  pecado: { icono: "🔥", nombre: "Pecado" },
  plegaria: { icono: "🙏", nombre: "Plegaria" },
};
const LS_CODIGO = "confesionario-codigo";

let sb, uid;
let codigo = null;
let sala = null;
let esPadre = false;
let confesiones = [];
let canal = null;
let ultimaCampana = null;
let recarga = null;
let enviadas = 0;
let cargaInicial = true; // evita efectos al cargar confesiones ya existentes
const cartas = new Map(); // id -> elemento del altar

// ---------- Utilidades ----------
function el(tag, clase, texto) {
  const e = document.createElement(tag);
  if (clase) e.className = clase;
  if (texto !== undefined) e.textContent = texto;
  return e;
}

function aviso(msg, ms = 4000) {
  const a = $("#aviso");
  a.textContent = msg;
  a.classList.remove("oculto");
  if (ms) setTimeout(() => a.classList.add("oculto"), ms);
}

async function seguro(fn) {
  try {
    await fn();
  } catch (err) {
    console.error(err);
    aviso(err.code === "42501" ? "El cielo denegó el permiso (revisa que corriste supabase.sql)." : `Error: ${err.message}`);
  }
}

// Ejecuta una consulta de Supabase y lanza el error si lo hay
async function q(peticion) {
  const { data, error } = await peticion;
  if (error) throw error;
  return data;
}

function generarCodigo() {
  const letras = "BCDFGHJKLMNPRSTVXZ";
  return Array.from({ length: 5 }, () => letras[Math.floor(Math.random() * letras.length)]).join("");
}

// ---------- Ambiente y efectos ----------
let silencio = localStorage.getItem("confesionario-silencio") === "1";
$("#btnSonido").textContent = silencio ? "🔇" : "🔊";
$("#btnSonido").addEventListener("click", () => {
  silencio = !silencio;
  localStorage.setItem("confesionario-silencio", silencio ? "1" : "0");
  $("#btnSonido").textContent = silencio ? "🔇" : "🔊";
});

const rnd = (a, b) => a + Math.random() * (b - a);

function crearAmbiente() {
  const amb = $("#ambiente");
  for (let i = 0; i < 28; i++) {
    const p = el("span", "polvo");
    p.style.cssText = `--x:${rnd(0, 100)}%;--s:${rnd(3, 8)}px;--d:${rnd(9, 20)}s;--r:${-rnd(0, 20)}s;--dx:${rnd(-80, 80)}px`;
    amb.appendChild(p);
  }
  for (let i = 0; i < 5; i++) {
    const h = el("span", "humo");
    h.style.cssText = `--x:${rnd(5, 95)}%;--d:${rnd(14, 24)}s;--r:${-rnd(0, 20)}s;--dx:${rnd(-120, 120)}px`;
    amb.appendChild(h);
  }
}
crearAmbiente();

function lanzar(emoji, clase, cantidad, tamano = [26, 54]) {
  const fx = $("#efectos");
  for (let i = 0; i < cantidad; i++) {
    const v = el("span", `volador ${clase}`, emoji);
    v.style.cssText = `--x:${rnd(2, 96)}%;--s:${rnd(...tamano)}px;--d:${rnd(2.4, 4.6)}s;--r:${rnd(0, 1.2)}s;--dx:${rnd(-90, 90)}px`;
    fx.appendChild(v);
    v.addEventListener("animationend", () => v.remove());
  }
}

function destello(color) {
  const l = el("div", `luz ${color}`);
  $("#efectos").appendChild(l);
  l.addEventListener("animationend", () => l.remove());
}

function efectoRevelar(tipo) {
  if (tipo === "milagro") { destello("dorada"); lanzar("🕊️", "paloma", 7); }
  else if (tipo === "pecado") { destello("roja"); lanzar("🔥", "brasa", 14, [20, 42]); }
  else { destello("violeta"); lanzar("✨", "estrella", 14, [20, 40]); }
}

function efectoAbsolver() {
  destello("dorada");
  lanzar("✝️", "cruz", 22, [22, 40]);
  lanzar("🕊️", "paloma", 4);
  coro();
}

// Acorde de coro: ondas suaves con ataque lento y vibrato leve
function coro() {
  if (silencio) return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [261.63, 329.63, 392.0, 523.25].forEach((f) => {
      const o = ctx.createOscillator();
      const vib = ctx.createOscillator();
      const vg = ctx.createGain();
      const g = ctx.createGain();
      o.type = "triangle";
      o.frequency.value = f;
      vib.frequency.value = 5.5;
      vg.gain.value = 3;
      vib.connect(vg).connect(o.frequency);
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + 0.9);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 3.6);
      o.connect(g).connect(ctx.destination);
      o.start(); vib.start();
      o.stop(ctx.currentTime + 3.7); vib.stop(ctx.currentTime + 3.7);
    });
  } catch { /* sin audio disponible */ }
}

function cerrarCortinas(ms = 1800) {
  const c = $("#confesionario");
  c.classList.add("cerrada");
  setTimeout(() => c.classList.remove("cerrada"), ms);
}

function sonarCampana() {
  if (silencio) return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [220, 440, 663].forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = f;
      g.gain.setValueAtTime(0.25 / (i + 1), ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 2.5);
      o.connect(g).connect(ctx.destination);
      o.start();
      o.stop(ctx.currentTime + 2.5);
    });
  } catch { /* sin audio disponible */ }
}

function mostrarCampana() {
  const ov = $("#overlayCampana");
  ov.classList.remove("oculto");
  sonarCampana();
  setTimeout(() => ov.classList.add("oculto"), 2600);
}

// ---------- Inicio ----------
async function iniciar() {
  if (SUPABASE_URL.includes("TU_PROYECTO") || SUPABASE_ANON_KEY.startsWith("TU_")) {
    aviso("Falta configurar Supabase: edita supabase-config.js (ver README).", 0);
    return;
  }
  sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // Reutiliza la sesión anónima guardada; si no hay, crea una nueva
  const { data: { session } } = await sb.auth.getSession();
  if (session) {
    uid = session.user.id;
  } else {
    const data = await q(sb.auth.signInAnonymously());
    uid = data.user.id;
  }

  const guardado = localStorage.getItem(LS_CODIGO);
  if (guardado) await entrarSala(guardado, true);
}

$("#formPadre").addEventListener("submit", (e) => {
  e.preventDefault();
  seguro(async () => {
    if (!uid) throw new Error("Supabase no está listo.");
    const sprint = $("#inSprint").value.trim();
    // Reintenta si el código aleatorio ya existe
    for (let intento = 0; intento < 5; intento++) {
      const nuevo = generarCodigo();
      const { error } = await sb.from("rooms").insert({ code: nuevo, sprint, host: uid });
      if (!error) return entrarSala(nuevo);
      if (error.code !== "23505") throw error;
    }
    throw new Error("No se pudo generar un código libre. Intenta de nuevo.");
  });
});

$("#formFeligres").addEventListener("submit", (e) => {
  e.preventDefault();
  seguro(() => entrarSala($("#inCodigo").value.trim().toUpperCase()));
});

async function entrarSala(cod, silencioso = false) {
  if (!uid) throw new Error("Supabase no está listo.");
  const fila = await q(sb.from("rooms").select("*").eq("code", cod).maybeSingle());
  if (!fila) {
    localStorage.removeItem(LS_CODIGO);
    if (!silencioso) aviso("No existe ese confesionario. Revisa el código.");
    return;
  }
  salirSala(false);
  cargaInicial = true;
  codigo = cod;
  sala = fila;
  esPadre = sala.host === uid;
  ultimaCampana = sala.campana;
  localStorage.setItem(LS_CODIGO, cod);
  preparar();

  // Tiempo real. Las reglas (RLS) deciden qué filas recibe cada quien.
  // Ante cualquier cambio de confesiones o amenes se recarga la sala completa.
  canal = sb
    .channel(`sala-${cod}`)
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "rooms", filter: `code=eq.${cod}` }, (p) => {
      sala = p.new;
      if (sala.campana !== ultimaCampana) mostrarCampana();
      ultimaCampana = sala.campana;
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "confesiones" }, programarRecarga)
    .on("postgres_changes", { event: "*", schema: "public", table: "amenes" }, programarRecarga)
    .subscribe((estado) => {
      // Al (re)conectar, recarga por si se perdió algún cambio
      if (estado === "SUBSCRIBED") programarRecarga();
    });

  await cargarConfesiones();
}

function programarRecarga() {
  clearTimeout(recarga);
  recarga = setTimeout(() => seguro(cargarConfesiones), 120);
}

async function cargarConfesiones() {
  if (!codigo) return;
  const cod = codigo;
  const filas = await q(
    sb.from("confesiones").select("*, amenes(uid)").eq("room", cod).order("created_at")
  );
  if (cod !== codigo) return; // salió de la sala mientras cargaba
  confesiones = filas.map((c) => ({ ...c, amenes: (c.amenes || []).map((a) => a.uid) }));
  render();
  cargaInicial = false;
}

function preparar() {
  $("#inicio").classList.add("oculto");
  $("#sala").classList.remove("oculto");
  $("#tituloSprint").textContent = sala.sprint;
  $("#codigoSala").textContent = codigo;
  $("#subtitulo").textContent = esPadre
    ? "«Tú escuchas, hijo mío. Ellos confiesan.»"
    : "«Entra, hijo mío. Nadie sabrá quién eres.»";
  $("#accionesPadre").classList.toggle("oculto", !esPadre);
  $("#accionesFeligres").classList.toggle("oculto", esPadre);
  $("#vistaPadre").classList.toggle("oculto", !esPadre);
  $("#vistaFeligres").classList.toggle("oculto", esPadre);
  // Las cortinas se abren al entrar
  const conf = $("#confesionario");
  conf.classList.add("cerrada");
  requestAnimationFrame(() => setTimeout(() => conf.classList.remove("cerrada"), 150));
}

function salirSala(volverInicio = true) {
  if (canal) sb.removeChannel(canal);
  canal = null;
  clearTimeout(recarga);
  codigo = sala = null;
  ultimaCampana = null;
  confesiones = [];
  cartas.clear();
  $("#listaAltar").replaceChildren();
  if (volverInicio) {
    localStorage.removeItem(LS_CODIGO);
    $("#sala").classList.add("oculto");
    $("#inicio").classList.remove("oculto");
  }
}
$("#btnSalir").addEventListener("click", () => salirSala());
$("#btnSalir2").addEventListener("click", () => salirSala());

// ---------- Feligrés: confesar ----------
$("#formConfesion").addEventListener("submit", (e) => {
  e.preventDefault();
  const texto = $("#txtConfesion").value.trim();
  if (!texto) return;
  const tipo = document.querySelector('input[name="tipo"]:checked').value;
  seguro(async () => {
    await q(sb.from("confesiones").insert({ room: codigo, autor: uid, tipo, texto }));
    $("#txtConfesion").value = "";
    cerrarCortinas();
    enviadas += 1;
    $("#contadorConf").textContent = `🕯️ Tu confesión fue depositada. Has confesado ${enviadas} ${enviadas === 1 ? "vez" : "veces"}.`;
  });
});

// ---------- Padre: acciones ----------
const tocarCampana = () => q(sb.from("rooms").update({ campana: Date.now() }).eq("code", codigo));
const editarConfesion = (id, cambios) => q(sb.from("confesiones").update(cambios).eq("id", id));

$("#btnCampana").addEventListener("click", () => seguro(tocarCampana));

$("#btnExportar").addEventListener("click", () => {
  const abiertas = confesiones.filter((c) => c.revelada).sort((a, b) => b.amenes.length - a.amenes.length);
  const seccion = (titulo, tipo) => {
    const items = abiertas.filter((c) => c.tipo === tipo).map((c) => `- ${c.texto} (🙏 ${c.amenes.length})`);
    return `## ${titulo}\n${items.join("\n") || "_Sin registros_"}\n`;
  };
  const pens = abiertas
    .filter((c) => c.penitencia)
    .map((c) => `- [${c.absuelta ? "x" : " "}] ${c.penitencia}  \n  _por: ${c.texto}_`);
  const md = [
    `# Acta de confesión: ${sala.sprint}`, "",
    seccion("🕊️ Milagros", "milagro"),
    seccion("🔥 Pecados", "pecado"),
    seccion("🙏 Plegarias", "plegaria"),
    `## 📿 Penitencias\n${pens.join("\n") || "_Sin penitencias_"}\n`,
  ].join("\n");
  const url = URL.createObjectURL(new Blob([md], { type: "text/markdown" }));
  const a = el("a");
  a.href = url;
  a.download = `acta-${sala.sprint.replace(/\W+/g, "-")}.md`;
  a.click();
  URL.revokeObjectURL(url);
});

function abrirSobre(c) {
  seguro(async () => {
    await editarConfesion(c.id, { revelada: true });
    await tocarCampana();
  });
}

// ---------- Render ----------
function render() {
  if (esPadre) renderBuzon();
  renderAltar();
}

function renderBuzon() {
  const selladas = confesiones.filter((c) => !c.revelada);
  const resumen = $("#resumenBuzon");
  resumen.replaceChildren();
  const abiertas = confesiones.length - selladas.length;
  resumen.append(el("span", "", `✉️ ${selladas.length} sin abrir`), el("span", "", `📖 ${abiertas} reveladas`));

  const lista = $("#listaSobres");
  lista.replaceChildren();
  selladas.forEach((c) => {
    const s = el("div", "sobre");
    s.append(el("span", "tipo", TIPOS[c.tipo].icono), el("div", "", `Sobre de ${TIPOS[c.tipo].nombre.toLowerCase()}`));
    const b = el("button", "btn-oro", "Abrir sobre");
    b.addEventListener("click", () => abrirSobre(c));
    s.appendChild(b);
    lista.appendChild(s);
  });
}

function renderAltar() {
  const reveladas = confesiones
    .filter((c) => c.revelada)
    .sort((a, b) => b.amenes.length - a.amenes.length);

  $("#altarVacio").classList.toggle("oculto", reveladas.length > 0);
  const lista = $("#listaAltar");
  const vivos = new Set(reveladas.map((c) => c.id));

  // Quitar cartas que ya no existen
  for (const [id, nodo] of cartas) {
    if (!vivos.has(id)) { nodo.remove(); cartas.delete(id); }
  }
  // Crear o actualizar en sitio (conserva lo que el Padre esté escribiendo)
  reveladas.forEach((c) => {
    let nodo = cartas.get(c.id);
    if (!nodo) {
      nodo = crearCarta(c);
      cartas.set(c.id, nodo);
      lista.appendChild(nodo);
      if (!cargaInicial) {
        nodo.classList.add("revelando");
        setTimeout(() => nodo.classList.remove("revelando"), 2600);
        efectoRevelar(c.tipo);
      }
    }
    actualizarCarta(nodo, c);
  });
  // Reordenar solo si hace falta
  const actual = [...lista.children].map((n) => n.dataset.id);
  const deseado = reveladas.map((c) => c.id);
  if (actual.join() !== deseado.join()) deseado.forEach((id) => lista.appendChild(cartas.get(id)));
}

function crearCarta(c) {
  const n = el("div", `carta ${c.tipo}`);
  n.dataset.id = c.id;
  n.etiqueta = el("div", "etiqueta", `${TIPOS[c.tipo].icono} ${TIPOS[c.tipo].nombre}`);
  n.texto = el("p", "texto");
  n.pen = el("div", "pen");
  n.sello = el("div", "sello", "ABSUELTO");

  const pie = el("div", "carta-pie");
  n.amen = el("button", "btn-amen");
  n.amen.addEventListener("click", () => {
    const actual = confesiones.find((x) => x.id === c.id);
    const voto = actual.amenes.includes(uid);
    seguro(() => voto
      ? q(sb.from("amenes").delete().eq("confesion_id", c.id).eq("uid", uid))
      : q(sb.from("amenes").insert({ confesion_id: c.id, room: codigo, uid })));
  });
  pie.appendChild(n.amen);
  n.append(n.etiqueta, n.texto, n.pen, pie, n.sello);

  if (esPadre) {
    const ctrl = el("form", "ctrl");
    const fila = el("div", "ctrl-fila");
    n.inPen = el("input");
    n.inPen.type = "text";
    n.inPen.maxLength = 140;
    n.inPen.placeholder = "Penitencia (acción a tomar)";
    const bPen = el("button", "", "📿 Imponer");
    bPen.type = "submit";
    fila.append(n.inPen, bPen);

    const fila2 = el("div", "ctrl-fila");
    n.bAbs = el("button", "", "✝ Absolver");
    n.bAbs.type = "button";
    n.bAbs.addEventListener("click", () => {
      const actual = confesiones.find((x) => x.id === c.id);
      seguro(() => editarConfesion(c.id, { absuelta: !actual.absuelta }));
    });
    const bDel = el("button", "", "✖ Quemar");
    bDel.type = "button";
    bDel.addEventListener("click", () => seguro(() => q(sb.from("confesiones").delete().eq("id", c.id))));
    fila2.append(n.bAbs, bDel);

    ctrl.addEventListener("submit", (e) => {
      e.preventDefault();
      seguro(() => editarConfesion(c.id, { penitencia: n.inPen.value.trim() }));
    });
    ctrl.append(fila, fila2);
    n.appendChild(ctrl);
  }
  return n;
}

function actualizarCarta(n, c) {
  n.texto.textContent = c.texto;
  n.pen.textContent = c.penitencia ? `📿 Penitencia: ${c.penitencia}` : "";
  n.pen.classList.toggle("oculto", !c.penitencia);
  n.classList.toggle("absuelta", !!c.absuelta);
  // Efecto solo cuando pasa de no absuelta a absuelta durante la sesión
  if (n.estabaAbsuelta === false && c.absuelta && !cargaInicial) efectoAbsolver();
  n.estabaAbsuelta = !!c.absuelta;
  const voto = c.amenes.includes(uid);
  n.amen.textContent = `🙏 Amén ${c.amenes.length}`;
  n.amen.classList.toggle("votado", voto);
  if (n.bAbs) n.bAbs.textContent = c.absuelta ? "↩ Quitar absolución" : "✝ Absolver";
  if (n.inPen && document.activeElement !== n.inPen) n.inPen.value = c.penitencia || "";
}

iniciar().catch((err) => {
  console.error(err);
  aviso(`No se pudo iniciar Supabase: ${err.message}`, 0);
});
