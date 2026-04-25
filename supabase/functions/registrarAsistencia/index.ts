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

function minutosDelDia(d: Date) {
  return d.getHours() * 60 + d.getMinutes();
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

    const ahora = new Date();
    const minAhora = minutosDelDia(ahora);
    const jornada = detectarJornada(minAhora);

    if (!jornada) {
      return new Response(JSON.stringify({
        error: "Fuera de horario",
        detalle: "Solo se aceptan pases entre 6:30–12:30 (mañana) o 12:30–18:30 (tarde)",
      }), { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const cfg = JORNADAS[jornada];

    // Buscar último pase del empleado HOY en esta jornada
    const inicioDia = new Date(ahora); inicioDia.setHours(0, 0, 0, 0);
    const { data: pasesHoy } = await supabase
      .from("asistencias")
      .select("id, fecha_hora, tipo, jornada")
      .eq("empleado_id", empleado.id)
      .gte("fecha_hora", inicioDia.toISOString())
      .order("fecha_hora", { ascending: false });

    const ultimoCualquiera = pasesHoy?.[0];
    const pasesJornada = (pasesHoy || []).filter((p) => p.jornada === jornada);
    const ultimoJornada = pasesJornada[0];

    // Cooldown global (cualquier pase del día)
    if (ultimoCualquiera) {
      const diffMin = (ahora.getTime() - new Date(ultimoCualquiera.fecha_hora).getTime()) / 60000;
      if (diffMin < COOLDOWN_MIN) {
        const restante = Math.ceil(COOLDOWN_MIN - diffMin);
        return new Response(JSON.stringify({
          error: "Cooldown activo",
          detalle: `Debe esperar ${restante} min antes del próximo pase`,
        }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    // Determinar tipo: alterna entrada/salida dentro de la jornada
    const ultimoTipo = ultimoJornada?.tipo;
    let tipo: "entrada" | "salida";
    let minutos_desviacion = 0;

    if (!ultimoTipo || ultimoTipo === "salida") {
      tipo = "entrada";
      // Retardo si entra después del inicio de jornada
      minutos_desviacion = Math.max(0, minAhora - cfg.inicio);
    } else {
      tipo = "salida";
      // Salida temprana si sale antes del fin de jornada
      minutos_desviacion = Math.max(0, cfg.fin - minAhora);
    }

    // Si ya viene una URL procesada (desde set-scanned-uid), usarla directamente
    let foto_url: string | null = foto_url_recibida || null;

    // Solo subir si viene base64 y no hay URL ya procesada
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

    // Estado legacy: para compatibilidad con dashboard existente
    let estado = "presente";
    if (tipo === "entrada" && minutos_desviacion > 0) estado = "retardo";
    if (tipo === "salida" && minutos_desviacion > 0) estado = "salida_temprana";
    if (tipo === "salida" && minutos_desviacion === 0) estado = "salida";

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
