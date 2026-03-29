import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { uid, foto } = await req.json();

    if (!uid) {
      return new Response(JSON.stringify({ error: "UID requerido" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Find employee by RFID key
    const { data: empleado, error: empError } = await supabase
      .from("empleados")
      .select("id, nombre")
      .eq("rfid_key", uid)
      .maybeSingle();

    if (empError || !empleado) {
      return new Response(
        JSON.stringify({ error: "UID no registrado", uid }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let foto_url: string | null = null;

    // Upload photo if provided
    if (foto) {
      const base64Data = foto.replace(/^data:image\/\w+;base64,/, "");
      const binaryData = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));
      const fileName = `${empleado.id}/${Date.now()}.jpg`;

      const { error: uploadError } = await supabase.storage
        .from("asistencias")
        .upload(fileName, binaryData, { contentType: "image/jpeg", upsert: false });

      if (!uploadError) {
        const { data: urlData } = supabase.storage
          .from("asistencias")
          .getPublicUrl(fileName);
        foto_url = urlData.publicUrl;
      }
    }

    // Determine status based on time (8:00 AM cutoff)
    const now = new Date();
    const hour = now.getHours();
    const estado = hour >= 8 && hour < 9 ? "retardo" : "presente";

    // Insert attendance record
    const { error: insertError } = await supabase.from("asistencias").insert({
      empleado_id: empleado.id,
      foto_url,
      estado,
    });

    if (insertError) {
      return new Response(JSON.stringify({ error: "Error al registrar" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ message: `Bienvenido ${empleado.nombre}`, estado }),
      { status: 201, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: "Error interno" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
