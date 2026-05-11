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
  allIds: string[];
  tieneFalta: boolean;
}

const slotLabels: Record<SlotKey, string> = {
  manana_entrada: "Entrada AM",
  manana_salida:  "Salida AM",
  tarde_entrada:  "Entrada PM",
  tarde_salida:   "Salida PM",
};

function getSlot(r: AttendanceRecord): SlotKey | null {
  if (!r.jornada || !r.tipo) return null;
  if (r.jornada === "manana" && r.tipo === "entrada") return "manana_entrada";
  if (r.jornada === "manana" && r.tipo === "salida")  return "manana_salida";
  if (r.jornada === "tarde"  && r.tipo === "entrada") return "tarde_entrada";
  if (r.jornada === "tarde"  && r.tipo === "salida")  return "tarde_salida";
  return null;
}

export default function RecentAttendance() {
  const [rows, setRows]         = useState<EmpleadoRow[]>([]);
  const [zoomFoto, setZoomFoto] = useState<string | null>(null);

  const fetchRecords = async () => {
    const startLocal = new Date();
    startLocal.setHours(0, 0, 0, 0);
    const endLocal = new Date(startLocal);
    endLocal.setDate(endLocal.getDate() + 1);

    const startExpanded = new Date(startLocal);
    startExpanded.setDate(startExpanded.getDate() - 1);
    const endExpanded = new Date(endLocal);
    endExpanded.setDate(endExpanded.getDate() + 1);

    // Traemos empleados y asistencias en paralelo
    const [{ data: empData }, { data: asistData }] = await Promise.all([
      supabase.from("empleados").select("id, nombre, cargo").order("nombre"),
      supabase
        .from("asistencias")
        .select("id, fecha_hora, estado, tipo, jornada, minutos_desviacion, foto_url, empleado_id, empleados(nombre, cargo)")
        .gte("fecha_hora", startExpanded.toISOString())
        .lt("fecha_hora", endExpanded.toISOString())
        .order("fecha_hora", { ascending: true }),
    ]);

    const todayRecords = ((asistData || []) as unknown as AttendanceRecord[]).filter((r) => {
      const d = new Date(r.fecha_hora);
      return d >= startLocal && d < endLocal;
    });

    // Mapa base con TODOS los empleados (para poder mostrar faltas)
    const map = new Map<string, EmpleadoRow>();
    for (const emp of (empData || [])) {
      map.set(emp.id, {
        empleado_id: emp.id,
        nombre:      emp.nombre,
        cargo:       emp.cargo,
        slots:       { manana_entrada: null, manana_salida: null, tarde_entrada: null, tarde_salida: null },
        allIds:      [],
        tieneFalta:  false,
      });
    }

    // Rellenar slots con los registros de hoy
    for (const r of todayRecords) {
      if (!r.empleado_id) continue;
      const row = map.get(r.empleado_id);
      if (!row) continue;

      row.allIds.push(r.id);
      if (r.estado === "falta") row.tieneFalta = true;

      const slot = getSlot(r);
      if (slot && !row.slots[slot]) row.slots[slot] = r;
    }

    // Mostrar solo empleados con al menos un registro hoy (incluye faltas)
    const result = Array.from(map.values())
      .filter((row) => row.allIds.length > 0)
      .sort((a, b) => a.nombre.localeCompare(b.nombre));

    setRows(result);
  };

  // Eliminar un único marcaje (botón dentro de la celda)
  const handleDeleteOne = async (id: string) => {
    const { error } = await supabase.from("asistencias").delete().eq("id", id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Marcaje eliminado" });
    fetchRecords();
  };

  // Eliminar TODOS los registros del empleado en el día (botón de la fila)
  const handleDeleteRow = async (row: EmpleadoRow) => {
    if (!row.allIds.length) return;
    const { error } = await supabase.from("asistencias").delete().in("id", row.allIds);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    toast({
      title: "Registro completo eliminado",
      description: `${row.allIds.length} marcaje(s) de ${row.nombre} eliminados`,
    });
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

    // Celda especial para falta
    if (rec.estado === "falta") {
      return (
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-md bg-destructive/10 flex items-center justify-center text-xs text-destructive font-bold">
            F
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-xs font-medium text-destructive">Falta</span>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <button className="text-[10px] text-muted-foreground hover:text-destructive flex items-center gap-1 mt-0.5">
                  <Trash2 size={10} />
                </button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>¿Eliminar este registro de falta?</AlertDialogTitle>
                  <AlertDialogDescription>Esta acción no se puede deshacer.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={() => handleDeleteOne(rec.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                    Eliminar
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      );
    }

    const desv = rec.minutos_desviacion || 0;
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
          {desv > 0 && (
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
                <AlertDialogTitle>¿Eliminar este marcaje?</AlertDialogTitle>
                <AlertDialogDescription>Esta acción no se puede deshacer.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={() => handleDeleteOne(rec.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
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
    <>
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
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow
                    key={row.empleado_id}
                    className={row.tieneFalta ? "bg-destructive/5" : undefined}
                  >
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

                    {/* Botón eliminar fila completa */}
                    <TableCell className="text-right pr-4">
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <button
                            title="Eliminar todos los registros de hoy de este empleado"
                            className="text-muted-foreground hover:text-destructive transition-colors"
                          >
                            <Trash2 size={15} />
                          </button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>¿Eliminar registro completo?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Se eliminarán <strong>todos los marcajes de hoy</strong> de{" "}
                              <strong>{row.nombre}</strong> ({row.allIds.length} registro(s)).
                              Esta acción no se puede deshacer.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleDeleteRow(row)}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              Eliminar todo
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </div>

      <Dialog open={!!zoomFoto} onOpenChange={(open) => !open && setZoomFoto(null)}>
        <DialogContent className="max-w-3xl p-2 bg-background">
          {zoomFoto && (
            <img
              src={zoomFoto}
              alt="Foto de asistencia ampliada"
              className="w-full h-auto max-h-[80vh] object-contain rounded-md"
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}