import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { Download, Search, Trash2 } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { addDays, format, subDays } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "@/hooks/use-toast";
import * as XLSX from "xlsx";

interface ReportRecord {
  id: string;
  fecha_hora: string;
  estado: string;
  foto_url: string | null;
  empleados: { nombre: string; cedula: string; cargo: string } | null;
}

export default function Reportes() {
  const [records, setRecords]       = useState<ReportRecord[]>([]);
  const [searchName, setSearchName] = useState("");
  const [dateFrom, setDateFrom]     = useState(format(subDays(new Date(), 7), "yyyy-MM-dd"));
  const [dateTo, setDateTo]         = useState(format(new Date(), "yyyy-MM-dd"));
  const [chartData, setChartData]   = useState<any[]>([]);
  const [zoomFoto, setZoomFoto]     = useState<string | null>(null);

  const fetchRecords = async () => {
    const fromLocal        = new Date(`${dateFrom}T00:00:00`);
    const toLocalExclusive = addDays(new Date(`${dateTo}T00:00:00`), 1);
    const fromExpanded     = subDays(fromLocal, 1);
    const toExpanded       = addDays(toLocalExclusive, 1);

    const { data } = await supabase
      .from("asistencias")
      .select("id, fecha_hora, estado, foto_url, empleados(nombre, cedula, cargo)")
      .gte("fecha_hora", fromExpanded.toISOString())
      .lt("fecha_hora", toExpanded.toISOString())
      .order("fecha_hora", { ascending: false });

    if (data) {
      const filtered = (data as unknown as ReportRecord[]).filter((r) => {
        const d = new Date(r.fecha_hora);
        return d >= fromLocal && d < toLocalExclusive;
      });
      setRecords(filtered);
      buildChartData(filtered);
    }
  };

  const buildChartData = (data: ReportRecord[]) => {
    const grouped: Record<string, { aTiempo: number; retardo: number; salidaTemprana: number; falta: number }> = {};
    data.forEach((r) => {
      const day = format(new Date(r.fecha_hora), "dd/MM");
      if (!grouped[day]) grouped[day] = { aTiempo: 0, retardo: 0, salidaTemprana: 0, falta: 0 };
      if (r.estado === "presente" || r.estado === "salida") grouped[day].aTiempo++;
      else if (r.estado === "retardo")         grouped[day].retardo++;
      else if (r.estado === "salida_temprana") grouped[day].salidaTemprana++;
      else if (r.estado === "falta")           grouped[day].falta++;
    });
    const entries = Object.entries(grouped).sort((a, b) => {
      const [da, ma] = a[0].split("/").map(Number);
      const [db, mb] = b[0].split("/").map(Number);
      return ma === mb ? da - db : ma - mb;
    });
    setChartData(entries.map(([dia, vals]) => ({ dia, ...vals })));
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("asistencias").delete().eq("id", id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    // Actualizar lista local sin refetch
    setRecords((prev) => {
      const next = prev.filter((r) => r.id !== id);
      buildChartData(next);
      return next;
    });
    toast({ title: "Registro eliminado" });
  };

  useEffect(() => { fetchRecords(); }, [dateFrom, dateTo]);

  const filtered = records.filter(
    (r) => !searchName || r.empleados?.nombre.toLowerCase().includes(searchName.toLowerCase())
  );

  const exportXLSX = () => {
    const rows = filtered.map((r) => ({
      Nombre:         r.empleados?.nombre || "",
      Cédula:         r.empleados?.cedula || "",
      Cargo:          r.empleados?.cargo  || "",
      "Fecha y Hora": format(new Date(r.fecha_hora), "dd/MM/yyyy HH:mm", { locale: es }),
      Estado:         r.estado,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Reporte");
    XLSX.writeFile(wb, `reporte_asistencias_${dateFrom}_${dateTo}.xlsx`);
  };

  const estadoBadge = (estado: string) => {
    const map: Record<string, string> = {
      presente:        "bg-success/10 text-success",
      salida:          "bg-success/10 text-success",
      retardo:         "bg-warning/10 text-warning",
      salida_temprana: "bg-warning/10 text-warning",
      falta:           "bg-destructive/10 text-destructive",
    };
    return map[estado] ?? "bg-muted/40 text-muted-foreground";
  };

  return (
    <div className="space-y-6 pt-12 md:pt-0">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Reportes</h2>
          <p className="text-muted-foreground text-sm">Historial y análisis de asistencias</p>
        </div>
        <Button onClick={exportXLSX} variant="outline" className="border-border">
          <Download size={16} className="mr-2" /> Exportar XLSX
        </Button>
      </div>

      {/* Filtros */}
      <div className="glass-card p-4 flex flex-wrap gap-4 items-end">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Desde</label>
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="bg-muted border-border w-40" />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Hasta</label>
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="bg-muted border-border w-40" />
        </div>
        <div className="flex-1 min-w-[200px] space-y-1">
          <label className="text-xs text-muted-foreground">Buscar empleado</label>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Nombre..." value={searchName} onChange={(e) => setSearchName(e.target.value)} className="pl-9 bg-muted border-border" />
          </div>
        </div>
      </div>

      {/* Tarjetas resumen */}
      {filtered.length > 0 && (() => {
        const total       = filtered.length;
        const aTiempo     = filtered.filter((r) => r.estado === "presente" || r.estado === "salida").length;
        const retardos    = filtered.filter((r) => r.estado === "retardo").length;
        const salidasTemp = filtered.filter((r) => r.estado === "salida_temprana").length;
        const faltas      = filtered.filter((r) => r.estado === "falta").length;
        const cards = [
          { label: "Total de pases",    value: total,       color: "text-foreground",  bg: "bg-muted/40" },
          { label: "A tiempo",          value: aTiempo,     color: "text-success",     bg: "bg-success/10" },
          { label: "Retardos",          value: retardos,    color: "text-warning",     bg: "bg-warning/10" },
          { label: "Salidas tempranas", value: salidasTemp, color: "text-warning",     bg: "bg-warning/10" },
          { label: "Faltas",            value: faltas,      color: "text-destructive", bg: "bg-destructive/10" },
        ];
        return (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {cards.map((c) => (
              <div key={c.label} className={`glass-card p-4 ${c.bg}`}>
                <p className="text-xs text-muted-foreground">{c.label}</p>
                <p className={`text-2xl font-bold mt-1 ${c.color}`}>{c.value}</p>
              </div>
            ))}
          </div>
        );
      })()}

      {/* Gráfico */}
      {chartData.length > 0 && (
        <div className="glass-card p-6">
          <div className="mb-4">
            <h3 className="font-semibold text-foreground">Pases por día</h3>
            <p className="text-xs text-muted-foreground">
              Cada barra muestra cuántos pases de tarjeta se registraron ese día, agrupados por categoría.
            </p>
          </div>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(217 33% 20%)" />
              <XAxis dataKey="dia" stroke="hsl(215 20% 55%)" fontSize={12} />
              <YAxis stroke="hsl(215 20% 55%)" fontSize={12} allowDecimals={false} />
              <Tooltip
                contentStyle={{ backgroundColor: "hsl(222 47% 9%)", border: "1px solid hsl(217 33% 20%)", borderRadius: "8px", color: "hsl(210 40% 96%)" }}
                labelFormatter={(label) => `Día ${label}`}
                cursor={{ fill: "hsla(210, 100%, 70%, 0.15)" }}
              />
              <Legend wrapperStyle={{ fontSize: "12px" }} />
              <Bar stackId="pases" dataKey="aTiempo"        fill="hsl(142 76% 45%)" name="A tiempo"          radius={[0, 0, 0, 0]} />
              <Bar stackId="pases" dataKey="retardo"        fill="hsl(38 92% 50%)"  name="Retardos"          radius={[0, 0, 0, 0]} />
              <Bar stackId="pases" dataKey="salidaTemprana" fill="hsl(25 95% 55%)"  name="Salidas tempranas" radius={[0, 0, 0, 0]} />
              <Bar stackId="pases" dataKey="falta"          fill="hsl(0 84% 60%)"   name="Faltas"            radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Tabla */}
      <div className="glass-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-6 py-3 text-muted-foreground font-medium">Empleado</th>
                <th className="text-left px-6 py-3 text-muted-foreground font-medium">Cédula</th>
                <th className="text-left px-6 py-3 text-muted-foreground font-medium">Fecha/Hora</th>
                <th className="text-left px-6 py-3 text-muted-foreground font-medium">Estado</th>
                <th className="text-left px-6 py-3 text-muted-foreground font-medium">Foto</th>
                <th className="px-4 py-3 w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((r) => (
                <tr key={r.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-6 py-3 text-foreground">{r.empleados?.nombre}</td>
                  <td className="px-6 py-3 text-muted-foreground">{r.empleados?.cedula}</td>
                  <td className="px-6 py-3 text-muted-foreground">
                    {format(new Date(r.fecha_hora), "dd/MM/yyyy HH:mm", { locale: es })}
                  </td>
                  <td className="px-6 py-3">
                    <span className={`px-2 py-0.5 rounded-md text-xs font-medium ${estadoBadge(r.estado)}`}>
                      {r.estado.replace("_", " ")}
                    </span>
                  </td>
                  <td className="px-6 py-3">
                    {r.foto_url ? (
                      <button
                        type="button"
                        onClick={() => setZoomFoto(r.foto_url)}
                        className="block focus:outline-none focus:ring-2 focus:ring-primary rounded"
                        title="Ver foto"
                      >
                        <img src={r.foto_url} alt="" className="w-8 h-8 rounded object-cover hover:opacity-80 transition-opacity cursor-zoom-in" />
                      </button>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>

                  {/* Botón eliminar fila */}
                  <td className="px-4 py-3 text-right">
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <button
                          title="Eliminar este registro"
                          className="text-muted-foreground hover:text-destructive transition-colors"
                        >
                          <Trash2 size={15} />
                        </button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>¿Eliminar este registro?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Se eliminará el registro de <strong>{r.empleados?.nombre}</strong> del{" "}
                            {format(new Date(r.fecha_hora), "dd/MM/yyyy HH:mm", { locale: es })}.
                            Esta acción no se puede deshacer.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => handleDelete(r.id)}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            Eliminar
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-muted-foreground">Sin registros</td>
                </tr>
              )}
            </tbody>
          </table>
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
    </div>
  );
}