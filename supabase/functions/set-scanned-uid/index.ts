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
    const { uid, foto, solo_foto } = await req.json();

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

    // Subir foto si viene
    let foto_url: string | null = null;
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
      } else {
        console.error("Error subiendo foto:", uploadError);
      }
    }

    // MODO SOLO FOTO: actualiza la última asistencia del empleado con esta foto
    if (solo_foto === true) {
      if (!foto_url) {
        return new Response(JSON.stringify({ error: "No se pudo procesar foto" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Buscar empleado por UID
      const { data: emp } = await supabase
        .from("empleados")
        .select("id")
        .eq("rfid_key", uid)
        .maybeSingle();

      if (emp?.id) {
        // Buscar la asistencia más reciente (últimos 2 minutos) sin foto o con cualquier foto
        const desde = new Date(Date.now() - 2 * 60 * 1000).toISOString();
        const { data: ult } = await supabase
          .from("asistencias")
          .select("id")
          .eq("empleado_id", emp.id)
          .gte("created_at", desde)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (ult?.id) {
          await supabase
            .from("asistencias")
            .update({ foto_url })
            .eq("id", ult.id);
          console.log("Foto adjuntada a asistencia:", ult.id);
        } else {
          console.log("No se encontró asistencia reciente para uid:", uid);
        }
      }

      return new Response(
        JSON.stringify({ message: "Foto procesada", foto_url }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // FLUJO NORMAL: guardar UID escaneado y registrar asistencia
    const { error } = await supabase.from("scanned_uids").insert({ uid, foto_url });
    if (error) {
      console.error("Error guardando scanned_uid:", error);
    }

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
          body: JSON.stringify({ uid, foto_url }),
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
    console.error("Error set-scanned-uid:", e);
    return new Response(JSON.stringify({ error: "Error interno" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
