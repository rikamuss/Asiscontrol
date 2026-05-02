import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import StatCard from "@/components/dashboard/StatCard";
import RecentAttendance from "@/components/dashboard/RecentAttendance";
import ManualAttendance from "@/components/dashboard/ManualAttendance";
import { Users, CheckCircle, Clock, XCircle } from "lucide-react";

export default function Dashboard() {
  const [stats, setStats] = useState({ total: 0, presentes: 0, retardos: 0, faltas: 0 });

  useEffect(() => {
    const ensureFaltasJornada = async () => {
      // Si la jornada matutina (>=12:31) o vespertina (>=18:31) ya cerró,
      // pedir a la edge function que registre las faltas que falten.
      const now = new Date();
      const jornadas: ("manana" | "tarde")[] = [];
      const cierreManana = new Date(now); cierreManana.setHours(12, 31, 0, 0);
      const cierreTarde = new Date(now); cierreTarde.setHours(18, 31, 0, 0);
      if (now >= cierreManana) jornadas.push("manana");
      if (now >= cierreTarde) jornadas.push("tarde");

      for (const jornada of jornadas) {
        try {
          await supabase.functions.invoke("marcar-faltas-jornada", { body: { jornada } });
        } catch (e) {
          console.error("Error marcando faltas", jornada, e);
        }
      }
    };

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

      // Faltas registradas hoy (las inserta el cron al cierre de cada jornada).
      // Antes del cierre de la jornada matutina (12:30) no se muestra ninguna falta,
      // porque el día aún no ha cerrado.
      const faltas = today.filter((a) => a.estado === "falta").length;

      setStats({ total: total || 0, presentes, retardos, faltas });
    };

    (async () => {
      await ensureFaltasJornada();
      await fetchStats();
    })();

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
