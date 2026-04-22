import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Trash2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface AttendanceRecord {
  id: string;
  fecha_hora: string;
  estado: string;
  tipo: string | null;
  jornada: string | null;
  minutos_desviacion: number | null;
  foto_url: string | null;
  empleados: { nombre: string; cargo: string } | null;
}

const estadoBadge: Record<string, string> = {
  presente: "bg-success/10 text-success border-success/20",
  salida: "bg-primary/10 text-primary border-primary/20",
  retardo: "bg-warning/10 text-warning border-warning/20",
  salida_temprana: "bg-warning/10 text-warning border-warning/20",
  falta: "bg-destructive/10 text-destructive border-destructive/20",
};

const estadoLabel: Record<string, string> = {
  presente: "Entrada",
  salida: "Salida",
  retardo: "Retardo",
  salida_temprana: "Salida temprana",
  falta: "Falta",
};

export default function RecentAttendance() {
  const [records, setRecords] = useState<AttendanceRecord[]>([]);

  const fetchRecords = async () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const { data } = await supabase
      .from("asistencias")
      .select("id, fecha_hora, estado, tipo, jornada, minutos_desviacion, foto_url, empleados(nombre, cargo)")
      .gte("fecha_hora", today.toISOString())
      .order("fecha_hora", { ascending: false })
      .limit(20);

    if (data) setRecords(data as unknown as AttendanceRecord[]);
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("asistencias").delete().eq("id", id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Registro eliminado" });
    fetchRecords();
  };

  useEffect(() => {
    fetchRecords();

    const channel = supabase
      .channel("realtime-asistencias")
      .on("postgres_changes", { event: "*", schema: "public", table: "asistencias" }, () => {
        fetchRecords();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  return (
    <div className="glass-card overflow-hidden">
      <div className="px-6 py-4 border-b border-border">
        <h3 className="font-semibold text-foreground">Registros de Hoy</h3>
        <p className="text-xs text-muted-foreground">Actualización en tiempo real</p>
      </div>
      <div className="divide-y divide-border max-h-[400px] overflow-y-auto">
        {records.length === 0 && (
          <p className="text-muted-foreground text-sm text-center py-8">Sin registros hoy</p>
        )}
        {records.map((r) => (
          <div key={r.id} className="flex items-center gap-4 px-6 py-3 hover:bg-muted/30 transition-colors">
            {r.foto_url ? (
              <img src={r.foto_url} alt="" className="w-10 h-10 rounded-lg object-cover" />
            ) : (
              <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center text-muted-foreground text-xs font-bold">
                {r.empleados?.nombre?.charAt(0) || "?"}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">{r.empleados?.nombre || "Desconocido"}</p>
              <p className="text-xs text-muted-foreground">{r.empleados?.cargo}</p>
            </div>
            <div className="text-right space-y-1 flex items-center gap-2">
              <div>
                <span className={`inline-block px-2 py-0.5 rounded-md text-xs font-medium border ${estadoBadge[r.estado] || "bg-muted text-muted-foreground border-border"}`}>
                  {estadoLabel[r.estado] || r.estado}
                  {r.minutos_desviacion ? ` · ${r.minutos_desviacion}m` : ""}
                </span>
                <p className="text-xs text-muted-foreground">
                  {r.jornada === "manana" ? "Mañana" : r.jornada === "tarde" ? "Tarde" : ""} · {format(new Date(r.fecha_hora), "HH:mm", { locale: es })}
                </p>
              </div>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <button
                    className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                    title="Eliminar registro"
                  >
                    <Trash2 size={14} />
                  </button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>¿Eliminar registro?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Se eliminará el registro de asistencia de {r.empleados?.nombre || "este empleado"}. Esta acción no se puede deshacer.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={() => handleDelete(r.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                      Eliminar
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
