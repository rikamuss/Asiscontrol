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

export default function ManualAttendance() {
  const [open, setOpen] = useState(false);
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [empleadoId, setEmpleadoId] = useState("");
  const [tipo, setTipo] = useState<"entrada" | "salida">("entrada");
  const [jornada, setJornada] = useState<"manana" | "tarde">("manana");
  const [estado, setEstado] = useState("presente");
  const [minutosDesv, setMinutosDesv] = useState(0);
  const [hora, setHora] = useState("");
  const [fecha, setFecha] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      supabase.from("empleados").select("id, nombre, cargo").order("nombre").then(({ data }) => {
        if (data) setEmpleados(data);
      });
      // Default a HOY y hora actual EN HORA LOCAL del navegador
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

    setSaving(true);
    const fechaHora = new Date(`${fecha}T${hora}:00`).toISOString();

    const { error } = await supabase.from("asistencias").insert({
      empleado_id: empleadoId,
      estado,
      tipo,
      jornada,
      minutos_desviacion: minutosDesv,
      fecha_hora: fechaHora,
    });

    setSaving(false);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }

    toast({ title: "Asistencia registrada manualmente" });
    setOpen(false);
    setEmpleadoId("");
    setEstado("presente");
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
          <div>
            <Label className="text-muted-foreground">Estado</Label>
            <Select value={estado} onValueChange={setEstado}>
              <SelectTrigger className="bg-muted border-border">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="presente">Entrada a tiempo</SelectItem>
                <SelectItem value="retardo">Retardo</SelectItem>
                <SelectItem value="salida">Salida a tiempo</SelectItem>
                <SelectItem value="salida_temprana">Salida temprana</SelectItem>
                <SelectItem value="falta">Falta</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-muted-foreground">Minutos de desviación</Label>
            <Input type="number" min={0} value={minutosDesv} onChange={(e) => setMinutosDesv(Number(e.target.value))} className="bg-muted border-border" />
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
          <Button onClick={handleSave} disabled={saving} className="w-full gradient-primary text-primary-foreground border-0">
            {saving ? "Guardando..." : "Registrar Asistencia"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
