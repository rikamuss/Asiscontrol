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

    if (!uid || typeof uid !== "string") {
      return new Response(JSON.stringify({ error: "UID requerido" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    let foto_url: string | null = null;

    // Upload photo if provided (base64 from ESP32 camera)
    if (foto && typeof foto === "string") {
      const base64Data = foto.replace(/^data:image\/\w+;base64,/, "");
      const binaryData = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));
      const fileName = `registros/${uid}_${Date.now()}.jpg`;

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

    const { error } = await supabase.from("scanned_uids").insert({ uid, foto_url });

    if (error) {
      console.error("Error guardando scanned_uid:", error);
    }

    // Intentar registrar asistencia automáticamente
    let asistenciaResult: any = null;
    try {
      const asistResp = await fetch(
        `${Deno.env.get("SUPABASE_URL")}/functions/v1/registrarAsistencia`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          },
          body: JSON.stringify({ uid, foto }),
        }
      );
      asistenciaResult = await asistResp.json();
      console.log("Resultado registrarAsistencia:", asistResp.status, asistenciaResult);
    } catch (e) {
      console.error("Error llamando registrarAsistencia:", e);
    }

    return new Response(
      JSON.stringify({ message: "UID recibido", uid, foto_url, asistencia: asistenciaResult }),
      { status: 201, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: "Error interno" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
