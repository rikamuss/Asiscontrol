//supabase/functions/check-photo-request/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function adjuntarFotoAUltimaAsistencia(supabase: any, uid: string, foto_url: string) {
  const { data: emp } = await supabase
    .from("empleados")
    .select("id")
    .eq("rfid_key", uid)
    .maybeSingle();

  if (!emp?.id) return null;

  const desde = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const { data: ult } = await supabase
    .from("asistencias")
    .select("id, foto_url")
    .eq("empleado_id", emp.id)
    .gte("created_at", desde)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!ult?.id) return null;

  // No sobreescribir foto si ya existe (la foto del registro es inmutable)
  if (ult.foto_url) {
    console.log("Asistencia ya tiene foto, no se sobreescribe:", ult.id);
    return ult.id;
  }

  const { error } = await supabase
    .from("asistencias")
    .update({ foto_url })
    .eq("id", ult.id);

  if (error) {
    console.error("Error adjuntando foto a asistencia:", error);
    return null;
  }

  console.log("Foto adjuntada a asistencia:", ult.id);
  return ult.id;
}

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

      const asistencia_id = await adjuntarFotoAUltimaAsistencia(supabase, uid, foto_url);
      if (!asistencia_id) console.log("No se encontró asistencia reciente para uid:", uid);

      return new Response(
        JSON.stringify({ message: "Foto procesada", foto_url, asistencia_id }),
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

    const asistencia_id = foto_url
      ? await adjuntarFotoAUltimaAsistencia(supabase, uid, foto_url)
      : null;

    return new Response(
      JSON.stringify({ message: "UID recibido", uid, foto_url, asistencia: asistenciaResult, asistencia_id }),
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
