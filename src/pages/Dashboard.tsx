import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import StatCard from "@/components/dashboard/StatCard";
import RecentAttendance from "@/components/dashboard/RecentAttendance";
import ManualAttendance from "@/components/dashboard/ManualAttendance";
import { Users, CheckCircle, Clock, XCircle } from "lucide-react";

export default function Dashboard() {
  const [stats, setStats] = useState({ total: 0, presentes: 0, retardos: 0, faltas: 0 });

  useEffect(() => {
    const fetchStats = async () => {
      const startLocal = new Date();
      startLocal.setHours(0, 0, 0, 0);
      const endLocal = new Date(startLocal);
      endLocal.setDate(endLocal.getDate() + 1);
      const startExpanded = new Date(startLocal); startExpanded.setDate(startExpanded.getDate() - 1);
      const endExpanded = new Date(endLocal); endExpanded.setDate(endExpanded.getDate() + 1);

      const [{ count: total }, { data: asistencias }] = await Promise.all([
        supabase.from("empleados").select("*", { count: "exact", head: true }),
        supabase
          .from("asistencias")
          .select("estado, tipo, empleado_id, fecha_hora")
          .gte("fecha_hora", startExpanded.toISOString())
          .lt("fecha_hora", endExpanded.toISOString()),
      ]);

      const today = (asistencias || []).filter((a) => {
        const d = new Date(a.fecha_hora);
        return d >= startLocal && d < endLocal;
      });

      const presentes = today.filter((a) => a.estado === "presente").length;
      const retardos = today.filter((a) => a.estado === "retardo").length;

      // Faltas = empleados sin ninguna entrada registrada hoy
      const empleadosConEntrada = new Set(
        today.filter((a) => a.tipo === "entrada").map((a) => a.empleado_id),
      );
      const faltas = Math.max(0, (total || 0) - empleadosConEntrada.size);

      setStats({ total: total || 0, presentes, retardos, faltas });
    };

    fetchStats();

    const channel = supabase
      .channel("dashboard-realtime")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "asistencias" }, () => fetchStats())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  return (
    <div className="space-y-8 pt-12 md:pt-0">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Dashboard</h2>
          <p className="text-muted-foreground text-sm">Monitoreo en tiempo real de asistencias</p>
        </div>
        <ManualAttendance />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Total Empleados" value={stats.total} icon={Users} />
        <StatCard title="Presentes Hoy" value={stats.presentes} icon={CheckCircle} variant="success" />
        <StatCard title="Retardos Hoy" value={stats.retardos} icon={Clock} variant="warning" />
        <StatCard title="Faltas Hoy" value={stats.faltas} icon={XCircle} variant="destructive" />
      </div>

      <RecentAttendance />
    </div>
  );
}
