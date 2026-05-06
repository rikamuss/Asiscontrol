import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { Trash2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent } from "@/components/ui/dialog";

interface AttendanceRecord {
  id: string;
  fecha_hora: string;
  estado: string;
  tipo: string | null;
  jornada: string | null;
  minutos_desviacion: number | null;
  foto_url: string | null;
  empleado_id: string;
  empleados: { nombre: string; cargo: string } | null;
}

type SlotKey = "manana_entrada" | "manana_salida" | "tarde_entrada" | "tarde_salida";

interface EmpleadoRow {
  empleado_id: string;
  nombre: string;
  cargo: string;
  slots: Record<SlotKey, AttendanceRecord | null>;
}

const slotLabels: Record<SlotKey, string> = {
  manana_entrada: "Entrada AM",
  manana_salida: "Salida AM",
  tarde_entrada: "Entrada PM",
  tarde_salida: "Salida PM",
};

function getSlot(r: AttendanceRecord): SlotKey | null {
  if (!r.jornada || !r.tipo) return null;
  if (r.jornada === "manana" && r.tipo === "entrada") return "manana_entrada";
  if (r.jornada === "manana" && r.tipo === "salida") return "manana_salida";
  if (r.jornada === "tarde" && r.tipo === "entrada") return "tarde_entrada";
  if (r.jornada === "tarde" && r.tipo === "salida") return "tarde_salida";
  return null;
}

export default function RecentAttendance() {
  const [rows, setRows] = useState<EmpleadoRow[]>([]);
  const [zoomFoto, setZoomFoto] = useState<string | null>(null);

  const fetchRecords = async () => {
    // Día local del usuario (00:00 a 24:00). Ampliamos el rango ±1 día en la consulta
    // para incluir registros cuyo timestamp UTC cae en otro día calendario,
    // y luego filtramos en JS por día local del registro.
    const startLocal = new Date();
    startLocal.setHours(0, 0, 0, 0);
    const endLocal = new Date(startLocal);
    endLocal.setDate(endLocal.getDate() + 1);

    const startExpanded = new Date(startLocal);
    startExpanded.setDate(startExpanded.getDate() - 1);
    const endExpanded = new Date(endLocal);
    endExpanded.setDate(endExpanded.getDate() + 1);

    const { data } = await supabase
      .from("asistencias")
      .select("id, fecha_hora, estado, tipo, jornada, minutos_desviacion, foto_url, empleado_id, empleados(nombre, cargo)")
      .gte("fecha_hora", startExpanded.toISOString())
      .lt("fecha_hora", endExpanded.toISOString())
      .order("fecha_hora", { ascending: true });

    if (!data) return;

    const todayRecords = (data as unknown as AttendanceRecord[]).filter((r) => {
      const d = new Date(r.fecha_hora);
      return d >= startLocal && d < endLocal;
    });

    const map = new Map<string, EmpleadoRow>();
    for (const r of todayRecords) {
      if (!r.empleado_id) continue;
      let row = map.get(r.empleado_id);
      if (!row) {
        row = {
          empleado_id: r.empleado_id,
          nombre: r.empleados?.nombre || "Desconocido",
          cargo: r.empleados?.cargo || "",
          slots: { manana_entrada: null, manana_salida: null, tarde_entrada: null, tarde_salida: null },
        };
        map.set(r.empleado_id, row);
      }
      const slot = getSlot(r);
      if (slot && !row.slots[slot]) row.slots[slot] = r;
    }

    setRows(Array.from(map.values()).sort((a, b) => a.nombre.localeCompare(b.nombre)));
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
      .on("postgres_changes", { event: "*", schema: "public", table: "asistencias" }, () => fetchRecords())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const renderCell = (rec: AttendanceRecord | null) => {
    if (!rec) return <span className="text-muted-foreground text-xs">—</span>;
    const desv = rec.minutos_desviacion || 0;
    const isLate = desv > 0;
    return (
      <div className="flex items-center gap-2">
        {rec.foto_url ? (
          <button
            type="button"
            onClick={() => setZoomFoto(rec.foto_url)}
            className="block focus:outline-none focus:ring-2 focus:ring-primary rounded-md"
            title="Ver foto"
          >
            <img src={rec.foto_url} alt="" className="w-9 h-9 rounded-md object-cover border border-border hover:opacity-80 transition-opacity cursor-zoom-in" />
          </button>
        ) : (
          <div className="w-9 h-9 rounded-md bg-muted flex items-center justify-center text-xs text-muted-foreground">
            ?
          </div>
        )}
        <div className="flex flex-col min-w-0">
          <span className="text-xs font-medium text-foreground">
            {format(new Date(rec.fecha_hora), "HH:mm")}
          </span>
          {isLate && (
            <span className="text-[10px] text-warning">{desv}m desv.</span>
          )}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <button className="text-[10px] text-muted-foreground hover:text-destructive flex items-center gap-1 mt-0.5">
                <Trash2 size={10} />
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>¿Eliminar este registro?</AlertDialogTitle>
                <AlertDialogDescription>Esta acción no se puede deshacer.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={() => handleDelete(rec.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                  Eliminar
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    );
  };

  return (
    <div className="glass-card overflow-hidden">
      <div className="px-6 py-4 border-b border-border">
        <h3 className="font-semibold text-foreground">Registros de Hoy</h3>
        <p className="text-xs text-muted-foreground">4 marcajes por día — actualización en tiempo real</p>
      </div>
      <div className="max-h-[500px] overflow-auto">
        {rows.length === 0 ? (
          <p className="text-muted-foreground text-sm text-center py-8">Sin registros hoy</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Empleado</TableHead>
                <TableHead>{slotLabels.manana_entrada}</TableHead>
                <TableHead>{slotLabels.manana_salida}</TableHead>
                <TableHead>{slotLabels.tarde_entrada}</TableHead>
                <TableHead>{slotLabels.tarde_salida}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.empleado_id}>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="text-sm font-medium text-foreground">{row.nombre}</span>
                      <span className="text-xs text-muted-foreground">{row.cargo}</span>
                    </div>
                  </TableCell>
                  <TableCell>{renderCell(row.slots.manana_entrada)}</TableCell>
                  <TableCell>{renderCell(row.slots.manana_salida)}</TableCell>
                  <TableCell>{renderCell(row.slots.tarde_entrada)}</TableCell>
                  <TableCell>{renderCell(row.slots.tarde_salida)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
