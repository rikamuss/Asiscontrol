import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// === Configuración de jornadas (hora local del servidor / UTC del Date) ===
// Mañana: 7:00–12:00, ventana válida 6:30–12:30
// Tarde:  13:00–18:00, ventana válida 12:30–18:30
const JORNADAS = {
  manana: { inicio: 7 * 60, fin: 12 * 60, ventanaIni: 6 * 60 + 30, ventanaFin: 12 * 60 + 30 },
  tarde:  { inicio: 13 * 60, fin: 18 * 60, ventanaIni: 12 * 60 + 30, ventanaFin: 18 * 60 + 30 },
} as const;

const COOLDOWN_MIN = 30;

// Zona horaria fija: Colombia (UTC-5). Las edge functions corren en UTC,
// así que convertimos a hora local antes de detectar jornada/día.
const TZ_OFFSET_HOURS = -5;

function nowLocal(): Date {
  // Devuelve un Date "desplazado" cuyos getHours()/getDate() reflejan la hora local Colombia.
  return new Date(Date.now() + TZ_OFFSET_HOURS * 3600 * 1000);
}

function minutosDelDia(d: Date) {
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

// Convierte un Date local Colombia (creado con nowLocal o derivado) a su instante UTC real
function localToUtcISO(d: Date): string {
  return new Date(d.getTime() - TZ_OFFSET_HOURS * 3600 * 1000).toISOString();
}

function detectarJornada(min: number): "manana" | "tarde" | null {
  if (min >= JORNADAS.manana.ventanaIni && min <= JORNADAS.manana.ventanaFin) return "manana";
  if (min >= JORNADAS.tarde.ventanaIni && min <= JORNADAS.tarde.ventanaFin) return "tarde";
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { uid, foto, foto_url: foto_url_recibida } = await req.json();
    if (!uid) {
      return new Response(JSON.stringify({ error: "UID requerido" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Buscar empleado por RFID
    const { data: empleado } = await supabase
      .from("empleados").select("id, nombre").eq("rfid_key", uid).maybeSingle();

    if (!empleado) {
      return new Response(JSON.stringify({ error: "UID no registrado", uid }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ahora = new Date();           // instante real (UTC)
    const ahoraLocal = nowLocal();      // mismo instante "desplazado" a hora local Colombia

    // Validar día de la semana en hora LOCAL Colombia. Domingo = 0.
    const diaSemana = ahoraLocal.getUTCDay();
    if (diaSemana === 0) {
      return new Response(JSON.stringify({
        error: "Día no laborable",
        detalle: "Los registros solo se permiten de lunes a sábado",
      }), { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const minAhora = minutosDelDia(ahoraLocal);
    const jornada = detectarJornada(minAhora);

    if (!jornada) {
      return new Response(JSON.stringify({
        error: "Fuera de horario",
        detalle: "Solo se aceptan pases entre 6:30–12:30 (mañana) o 12:30–18:30 (tarde)",
      }), { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const cfg = JORNADAS[jornada];

    // Inicio del día LOCAL Colombia, expresado como instante UTC para la consulta
    const inicioDiaLocal = new Date(ahoraLocal); inicioDiaLocal.setUTCHours(0, 0, 0, 0);
    const inicioDiaUtcISO = localToUtcISO(inicioDiaLocal);
    const { data: pasesHoy } = await supabase
      .from("asistencias")
      .select("id, fecha_hora, tipo, jornada, estado")
      .eq("empleado_id", empleado.id)
      .gte("fecha_hora", inicioDiaUtcISO)
      .order("fecha_hora", { ascending: false });

    const pasesJornada = (pasesHoy || []).filter((p) => p.jornada === jornada);
    // Faltas auto-generadas por el cron en esta jornada (a reemplazar si llega un pase tardío)
    const faltaPendiente = pasesJornada.find((p: any) => p.estado === "falta" && p.tipo === "entrada");
    // Pases REALES (excluyendo faltas) para alternancia y cooldown
    const pasesRealesHoy = (pasesHoy || []).filter((p: any) => p.estado !== "falta");
    const pasesRealesJornada = pasesJornada.filter((p: any) => p.estado !== "falta");
    const ultimoReal = pasesRealesHoy[0];
    const ultimoJornadaReal = pasesRealesJornada[0];

    // Cooldown global SOLO contra pases reales (las faltas no cuentan)
    if (ultimoReal) {
      const diffMin = (ahora.getTime() - new Date(ultimoReal.fecha_hora).getTime()) / 60000;
      if (diffMin < COOLDOWN_MIN) {
        const restante = Math.ceil(COOLDOWN_MIN - diffMin);
        return new Response(JSON.stringify({
          error: "Cooldown activo",
          detalle: `Debe esperar ${restante} min antes del próximo pase`,
        }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    // Determinar tipo: alterna entrada/salida dentro de la jornada (solo pases reales)
    const ultimoTipo = ultimoJornadaReal?.tipo;
    let tipo: "entrada" | "salida";
    let minutos_desviacion = 0;

    if (!ultimoTipo || ultimoTipo === "salida") {
      tipo = "entrada";
      minutos_desviacion = Math.max(0, minAhora - cfg.inicio);
    } else {
      tipo = "salida";
      minutos_desviacion = Math.max(0, cfg.fin - minAhora);
    }

    // Procesar foto si viene en base64
    let foto_url: string | null = foto_url_recibida || null;
    if (foto && !foto_url) {
      const base64Data = foto.replace(/^data:image\/\w+;base64,/, "");
      const binaryData = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));
      const fileName = `${empleado.id}/${Date.now()}.jpg`;
      const { error: uploadError } = await supabase.storage
        .from("asistencias")
        .upload(fileName, binaryData, { contentType: "image/jpeg", upsert: false });
      if (!uploadError) {
        foto_url = supabase.storage.from("asistencias").getPublicUrl(fileName).data.publicUrl;
      }
    }

    // Estado legacy
    let estado = "presente";
    if (tipo === "entrada" && minutos_desviacion > 0) estado = "retardo";
    if (tipo === "salida" && minutos_desviacion > 0) estado = "salida_temprana";
    if (tipo === "salida" && minutos_desviacion === 0) estado = "salida";

    // Si es ENTRADA y existe una falta del cron para esta jornada → CONVERTIRLA (update),
    // no crear duplicado. Así el pase tardío "borra" la falta automática.
    if (tipo === "entrada" && faltaPendiente) {
      const { error: updError } = await supabase
        .from("asistencias")
        .update({
          fecha_hora: ahora.toISOString(),
          estado,
          tipo,
          jornada,
          minutos_desviacion,
          foto_url,
        })
        .eq("id", faltaPendiente.id);

      if (updError) {
        return new Response(JSON.stringify({ error: "Error al convertir falta", detalle: updError.message }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else {
      const { error: insertError } = await supabase.from("asistencias").insert({
        empleado_id: empleado.id,
        foto_url,
        estado,
        tipo,
        jornada,
        minutos_desviacion,
      });

      if (insertError) {
        return new Response(JSON.stringify({ error: "Error al registrar", detalle: insertError.message }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const msgPartes: string[] = [];
    msgPartes.push(`${tipo === "entrada" ? "Entrada" : "Salida"} ${jornada}`);
    if (tipo === "entrada" && minutos_desviacion > 0) msgPartes.push(`retraso ${minutos_desviacion} min`);
    if (tipo === "salida" && minutos_desviacion > 0) msgPartes.push(`salida temprana ${minutos_desviacion} min`);

    return new Response(JSON.stringify({
      message: `${empleado.nombre}: ${msgPartes.join(" · ")}`,
      tipo, jornada, minutos_desviacion, estado,
    }), { status: 201, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (e) {
    return new Response(JSON.stringify({ error: "Error interno", detalle: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
