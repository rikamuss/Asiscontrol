import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { ClipboardPlus } from "lucide-react";

interface Empleado {
  id: string;
  nombre: string;
  cargo: string;
}

// Horarios oficiales (lunes a sábado): mañana 7-12, tarde 13-18
const HORARIOS: Record<string, Record<string, { h: number; m: number }>> = {
  manana: { entrada: { h: 7, m: 0 }, salida: { h: 12, m: 0 } },
  tarde: { entrada: { h: 13, m: 0 }, salida: { h: 18, m: 0 } },
};

function calcularDesviacionYEstado(
  fecha: string,
  hora: string,
  jornada: "manana" | "tarde",
  tipo: "entrada" | "salida",
) {
  const ref = HORARIOS[jornada][tipo];
  const refDate = new Date(`${fecha}T${String(ref.h).padStart(2, "0")}:${String(ref.m).padStart(2, "0")}:00`);
  const actual = new Date(`${fecha}T${hora}:00`);
  const diffMin = Math.round((actual.getTime() - refDate.getTime()) / 60000);

  let estado = "presente";
  let minutos_desviacion = 0;

  if (tipo === "entrada") {
    if (diffMin > 0) {
      estado = "retardo";
      minutos_desviacion = diffMin;
    } else {
      estado = "presente";
      minutos_desviacion = 0;
    }
  } else {
    // salida
    if (diffMin < 0) {
      estado = "salida_temprana";
      minutos_desviacion = Math.abs(diffMin);
    } else {
      estado = "salida";
      minutos_desviacion = 0;
    }
  }

  return { estado, minutos_desviacion };
}

export default function ManualAttendance() {
  const [open, setOpen] = useState(false);
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [empleadoId, setEmpleadoId] = useState("");
  const [tipo, setTipo] = useState<"entrada" | "salida">("entrada");
  const [jornada, setJornada] = useState<"manana" | "tarde">("manana");
  const [hora, setHora] = useState("");
  const [fecha, setFecha] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      supabase.from("empleados").select("id, nombre, cargo").order("nombre").then(({ data }) => {
        if (data) setEmpleados(data);
      });
      const now = new Date();
      const yyyy = now.getFullYear();
      const mm = String(now.getMonth() + 1).padStart(2, "0");
      const dd = String(now.getDate()).padStart(2, "0");
      setFecha(`${yyyy}-${mm}-${dd}`);
      setHora(now.toTimeString().slice(0, 5));
    }
  }, [open]);

  const handleSave = async () => {
    if (!empleadoId) {
      toast({ title: "Error", description: "Seleccione un empleado", variant: "destructive" });
      return;
    }

    // Validar día (no domingo)
    const fechaDate = new Date(`${fecha}T00:00:00`);
    if (fechaDate.getDay() === 0) {
      toast({ title: "Día no laboral", description: "Los registros son de lunes a sábado.", variant: "destructive" });
      return;
    }

    setSaving(true);

    const fechaHoraDate = new Date(`${fecha}T${hora}:00`);
    const fechaHora = fechaHoraDate.toISOString();

    const startLocal = new Date(`${fecha}T00:00:00`);
    const endLocal = new Date(startLocal);
    endLocal.setDate(endLocal.getDate() + 1);
    const startExpanded = new Date(startLocal); startExpanded.setDate(startExpanded.getDate() - 1);
    const endExpanded = new Date(endLocal); endExpanded.setDate(endExpanded.getDate() + 1);

    const { data: existentes } = await supabase
      .from("asistencias")
      .select("id, fecha_hora, jornada, tipo")
      .eq("empleado_id", empleadoId)
      .eq("jornada", jornada)
      .eq("tipo", tipo)
      .gte("fecha_hora", startExpanded.toISOString())
      .lt("fecha_hora", endExpanded.toISOString());

    const duplicado = (existentes || []).some((r) => {
      const d = new Date(r.fecha_hora);
      return d >= startLocal && d < endLocal;
    });

    if (duplicado) {
      setSaving(false);
      toast({
        title: "Registro duplicado",
        description: `Ya existe una ${tipo} de la jornada ${jornada === "manana" ? "mañana" : "tarde"} para este empleado en esa fecha.`,
        variant: "destructive",
      });
      return;
    }

    const { estado, minutos_desviacion } = calcularDesviacionYEstado(fecha, hora, jornada, tipo);

    const { error } = await supabase.from("asistencias").insert({
      empleado_id: empleadoId,
      estado,
      tipo,
      jornada,
      minutos_desviacion,
      fecha_hora: fechaHora,
    });

    setSaving(false);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }

    toast({
      title: "Asistencia registrada",
      description: `${estado.replace("_", " ")}${minutos_desviacion ? ` (${minutos_desviacion}m)` : ""}`,
    });
    setOpen(false);
    setEmpleadoId("");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="border-border">
          <ClipboardPlus size={16} className="mr-2" /> Registro Manual
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-foreground">Registrar Asistencia Manual</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label className="text-muted-foreground">Empleado</Label>
            <Select value={empleadoId} onValueChange={setEmpleadoId}>
              <SelectTrigger className="bg-muted border-border">
                <SelectValue placeholder="Seleccione un empleado" />
              </SelectTrigger>
              <SelectContent>
                {empleados.map((emp) => (
                  <SelectItem key={emp.id} value={emp.id}>
                    {emp.nombre} — {emp.cargo}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-muted-foreground">Tipo</Label>
              <Select value={tipo} onValueChange={(v) => setTipo(v as "entrada" | "salida")}>
                <SelectTrigger className="bg-muted border-border"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="entrada">Entrada</SelectItem>
                  <SelectItem value="salida">Salida</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-muted-foreground">Jornada</Label>
              <Select value={jornada} onValueChange={(v) => setJornada(v as "manana" | "tarde")}>
                <SelectTrigger className="bg-muted border-border"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="manana">Mañana (7–12)</SelectItem>
                  <SelectItem value="tarde">Tarde (13–18)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-muted-foreground">Fecha</Label>
              <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="bg-muted border-border" />
            </div>
            <div>
              <Label className="text-muted-foreground">Hora</Label>
              <Input type="time" value={hora} onChange={(e) => setHora(e.target.value)} className="bg-muted border-border" />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            El estado y los minutos de desviación se calculan automáticamente según el horario L–S (mañana 7–12, tarde 13–18).
          </p>
          <Button onClick={handleSave} disabled={saving} className="w-full gradient-primary text-primary-foreground border-0">
            {saving ? "Guardando..." : "Registrar Asistencia"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
