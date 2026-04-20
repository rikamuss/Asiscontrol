import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// GET  -> el ESP32 consulta si hay petición pendiente
// POST -> el ESP32 sube la foto (base64) para una request_id dada
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    if (req.method === "GET") {
      const { data } = await supabase
        .from("foto_requests")
        .select("id, created_at")
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(1);

      const pending = data && data.length > 0 ? data[0] : null;
      return new Response(JSON.stringify({ pending }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (req.method === "POST") {
      const { request_id, foto } = await req.json();
      if (!request_id || !foto) {
        return new Response(JSON.stringify({ error: "request_id y foto requeridos" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const base64Data = String(foto).replace(/^data:image\/\w+;base64,/, "");
      const binaryData = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));
      const fileName = `empleados/pending/${request_id}_${Date.now()}.jpg`;

      const { error: upErr } = await supabase.storage
        .from("asistencias")
        .upload(fileName, binaryData, { contentType: "image/jpeg", upsert: true });

      if (upErr) {
        return new Response(JSON.stringify({ error: "Error subiendo foto" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: urlData } = supabase.storage.from("asistencias").getPublicUrl(fileName);
      const foto_url = urlData.publicUrl;

      await supabase
        .from("foto_requests")
        .update({ status: "done", foto_url, updated_at: new Date().toISOString() })
        .eq("id", request_id);

      return new Response(JSON.stringify({ ok: true, foto_url }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  } catch {
    return new Response(JSON.stringify({ error: "Error interno" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
