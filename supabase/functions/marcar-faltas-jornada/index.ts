import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Marca faltas por jornada para empleados que no registraron entrada.
// Se debe invocar al cierre de cada jornada:
//   - 12:31 → jornada "manana"
//   - 18:31 → jornada "tarde"
// También acepta { jornada: "manana"|"tarde", fecha?: "YYYY-MM-DD" } por si se llama manualmente.

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    let body: { jornada?: "manana" | "tarde"; fecha?: string } = {};
    try { body = await req.json(); } catch { /* sin body */ }

    // Zona horaria fija Colombia (UTC-5). Edge functions corren en UTC.
    const TZ_OFFSET_HOURS = -5;
    const ahora = new Date();
    const ahoraLocal = new Date(Date.now() + TZ_OFFSET_HOURS * 3600 * 1000);

    // Detectar jornada automáticamente si no se especifica (en hora LOCAL Colombia)
    let jornada: "manana" | "tarde" | null = body.jornada ?? null;
    if (!jornada) {
      const h = ahoraLocal.getUTCHours();
      if (h >= 12 && h < 18) jornada = "manana";
      else if (h >= 18 || h < 6) jornada = "tarde";
    }
    if (!jornada) {
      return new Response(JSON.stringify({ error: "Jornada no detectable, especifica { jornada }" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Día objetivo en hora LOCAL Colombia
    const targetLocal = body.fecha
      ? new Date(`${body.fecha}T12:00:00Z`)
      : ahoraLocal;
    const diaSemana = targetLocal.getUTCDay();
    if (diaSemana === 0) {
      return new Response(JSON.stringify({ message: "Domingo: no se generan faltas", insertadas: 0 }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Inicio/fin del día LOCAL como instantes UTC
    const inicioDiaLocal = new Date(targetLocal); inicioDiaLocal.setUTCHours(0, 0, 0, 0);
    const finDiaLocal = new Date(inicioDiaLocal); finDiaLocal.setUTCDate(finDiaLocal.getUTCDate() + 1);
    const inicioDiaUtc = new Date(inicioDiaLocal.getTime() - TZ_OFFSET_HOURS * 3600 * 1000);
    const finDiaUtc = new Date(finDiaLocal.getTime() - TZ_OFFSET_HOURS * 3600 * 1000);

    // Empleados totales
    const { data: empleados } = await supabase.from("empleados").select("id, nombre");

    // Pases del día en esta jornada
    const { data: pases } = await supabase
      .from("asistencias")
      .select("empleado_id, jornada, tipo, estado")
      .gte("fecha_hora", inicioDiaUtc.toISOString())
      .lt("fecha_hora", finDiaUtc.toISOString());

    const conEntrada = new Set(
      (pases || [])
        .filter((p) => p.jornada === jornada && p.tipo === "entrada")
        .map((p) => p.empleado_id),
    );
    const yaConFalta = new Set(
      (pases || [])
        .filter((p) => p.jornada === jornada && p.estado === "falta")
        .map((p) => p.empleado_id),
    );

    const aInsertar = (empleados || [])
      .filter((e) => !conEntrada.has(e.id) && !yaConFalta.has(e.id))
      .map((e) => ({
        empleado_id: e.id,
        estado: "falta",
        tipo: "entrada",
        jornada,
        minutos_desviacion: 0,
        // fecha_hora: marcamos al cierre de jornada (hora LOCAL convertida a UTC)
        fecha_hora: (() => {
          const d = new Date(inicioDiaLocal);
          if (jornada === "manana") d.setUTCHours(12, 30, 0, 0);
          else d.setUTCHours(18, 30, 0, 0);
          return new Date(d.getTime() - TZ_OFFSET_HOURS * 3600 * 1000).toISOString();
        })(),
      }));

    let insertadas = 0;
    if (aInsertar.length > 0) {
      const { error } = await supabase.from("asistencias").insert(aInsertar);
      if (error) {
        return new Response(JSON.stringify({ error: "Insert falló", detalle: error.message }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      insertadas = aInsertar.length;
    }

    return new Response(JSON.stringify({
      message: `Faltas marcadas para jornada ${jornada}`,
      jornada, fecha: inicioDia.toISOString().slice(0, 10), insertadas,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: "Error interno", detalle: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
