import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { Download, Search } from "lucide-react";
import { addDays, format, subDays, startOfDay } from "date-fns";
import { es } from "date-fns/locale";
import * as XLSX from "xlsx";

interface ReportRecord {
  id: string;
  fecha_hora: string;
  estado: string;
  foto_url: string | null;
  empleados: { nombre: string; cedula: string; cargo: string } | null;
}

export default function Reportes() {
  const [records, setRecords] = useState<ReportRecord[]>([]);
  const [searchName, setSearchName] = useState("");
  const [dateFrom, setDateFrom] = useState(format(subDays(new Date(), 7), "yyyy-MM-dd"));
  const [dateTo, setDateTo] = useState(format(new Date(), "yyyy-MM-dd"));
  const [chartData, setChartData] = useState<any[]>([]);

  const fetchRecords = async () => {
    // Interpretar dateFrom/dateTo como días LOCALES del usuario.
    // new Date("YYYY-MM-DDT00:00:00") usa la zona local del navegador.
    const fromLocal = new Date(`${dateFrom}T00:00:00`);
    const toLocalExclusive = addDays(new Date(`${dateTo}T00:00:00`), 1);

    const { data } = await supabase
      .from("asistencias")
      .select("id, fecha_hora, estado, foto_url, empleados(nombre, cedula, cargo)")
      .gte("fecha_hora", fromLocal.toISOString())
      .lt("fecha_hora", toLocalExclusive.toISOString())
      .order("fecha_hora", { ascending: false });

    if (data) {
      setRecords(data as unknown as ReportRecord[]);
      buildChartData(data as unknown as ReportRecord[]);
    }
  };

  const buildChartData = (data: ReportRecord[]) => {
    const grouped: Record<string, { presente: number; retardo: number; falta: number }> = {};

    data.forEach((r) => {
      const day = format(new Date(r.fecha_hora), "dd/MM");
      if (!grouped[day]) grouped[day] = { presente: 0, retardo: 0, falta: 0 };
      if (r.estado === "presente") grouped[day].presente++;
      else if (r.estado === "retardo") grouped[day].retardo++;
      else grouped[day].falta++;
    });

    setChartData(Object.entries(grouped).map(([dia, vals]) => ({ dia, ...vals })).reverse());
  };

  useEffect(() => { fetchRecords(); }, [dateFrom, dateTo]);

  const filtered = records.filter((r) =>
    !searchName || r.empleados?.nombre.toLowerCase().includes(searchName.toLowerCase())
  );

  const exportXLSX = () => {
    const rows = filtered.map((r) => ({
      Nombre: r.empleados?.nombre || "",
      Cédula: r.empleados?.cedula || "",
      Cargo: r.empleados?.cargo || "",
      "Fecha y Hora": format(new Date(r.fecha_hora), "dd/MM/yyyy HH:mm", { locale: es }),
      Estado: r.estado,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Reporte");
    XLSX.writeFile(wb, `reporte_asistencias_${dateFrom}_${dateTo}.xlsx`);
  };

  return (
    <div className="space-y-6 pt-12 md:pt-0">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Reportes</h2>
          <p className="text-muted-foreground text-sm">Historial y análisis de asistencias</p>
        </div>
        <Button onClick={exportXLSX} variant="outline" className="border-border">
          <Download size={16} className="mr-2" /> Exportar XLSX
        </Button>
      </div>

      {/* Filters */}
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

      {/* Chart */}
      {chartData.length > 0 && (
        <div className="glass-card p-6">
          <h3 className="font-semibold text-foreground mb-4">Asistencias por Día</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(217 33% 20%)" />
              <XAxis dataKey="dia" stroke="hsl(215 20% 55%)" fontSize={12} />
              <YAxis stroke="hsl(215 20% 55%)" fontSize={12} />
              <Tooltip
                contentStyle={{ backgroundColor: "hsl(222 47% 9%)", border: "1px solid hsl(217 33% 20%)", borderRadius: "8px", color: "hsl(210 40% 96%)" }}
              />
              <Legend />
              <Bar dataKey="presente" fill="hsl(142 76% 45%)" name="Presentes" radius={[4, 4, 0, 0]} />
              <Bar dataKey="retardo" fill="hsl(38 92% 50%)" name="Retardos" radius={[4, 4, 0, 0]} />
              <Bar dataKey="falta" fill="hsl(0 84% 60%)" name="Faltas" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Table */}
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
                    <span className={`px-2 py-0.5 rounded-md text-xs font-medium ${
                      r.estado === "presente" ? "bg-success/10 text-success" :
                      r.estado === "retardo" ? "bg-warning/10 text-warning" :
                      "bg-destructive/10 text-destructive"
                    }`}>
                      {r.estado}
                    </span>
                  </td>
                  <td className="px-6 py-3">
                    {r.foto_url ? (
                      <img src={r.foto_url} alt="" className="w-8 h-8 rounded object-cover" />
                    ) : <span className="text-muted-foreground">—</span>}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={5} className="text-center py-8 text-muted-foreground">Sin registros</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
