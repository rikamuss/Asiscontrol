//supabase/functions/check-photo-request/index.ts
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

    const ahora = new Date();
    // Detectar jornada automáticamente si no se especifica
    let jornada: "manana" | "tarde" | null = body.jornada ?? null;
    if (!jornada) {
      const h = ahora.getHours();
      if (h >= 12 && h < 18) jornada = "manana";
      else if (h >= 18 || h < 6) jornada = "tarde";
    }
    if (!jornada) {
      return new Response(JSON.stringify({ error: "Jornada no detectable, especifica { jornada }" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Día objetivo (local del servidor)
    const target = body.fecha ? new Date(`${body.fecha}T12:00:00`) : ahora;
    const diaSemana = target.getDay();
    if (diaSemana === 0) {
      return new Response(JSON.stringify({ message: "Domingo: no se generan faltas", insertadas: 0 }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const inicioDia = new Date(target); inicioDia.setHours(0, 0, 0, 0);
    const finDia = new Date(inicioDia); finDia.setDate(finDia.getDate() + 1);

    // Empleados totales
    const { data: empleados } = await supabase.from("empleados").select("id, nombre");

    // Pases del día en esta jornada
    const { data: pases } = await supabase
      .from("asistencias")
      .select("empleado_id, jornada, tipo, estado")
      .gte("fecha_hora", inicioDia.toISOString())
      .lt("fecha_hora", finDia.toISOString());

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
        // fecha_hora: marcamos al cierre de jornada
        fecha_hora: (() => {
          const d = new Date(inicioDia);
          if (jornada === "manana") d.setHours(12, 30, 0, 0);
          else d.setHours(18, 30, 0, 0);
          return d.toISOString();
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
