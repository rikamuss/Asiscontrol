import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { Plus, Edit, Trash2, CreditCard, Search } from "lucide-react";

interface Empleado {
  id: string;
  nombre: string;
  cedula: string;
  cargo: string;
  telefono: string | null;
  rfid_key: string | null;
  foto_url: string | null;
}

export default function Empleados() {
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Empleado | null>(null);
  const [form, setForm] = useState({ nombre: "", cedula: "", cargo: "", telefono: "", rfid_key: "" });
  const [listening, setListening] = useState(false);

  const fetchEmpleados = async () => {
    const { data } = await supabase.from("empleados").select("*").order("nombre");
    if (data) setEmpleados(data);
  };

  useEffect(() => { fetchEmpleados(); }, []);

  const handleSave = async () => {
    if (!form.nombre || !form.cedula || !form.cargo) {
      toast({ title: "Error", description: "Nombre, cédula y cargo son requeridos", variant: "destructive" });
      return;
    }

    if (editing) {
      const { error } = await supabase.from("empleados").update(form).eq("id", editing.id);
      if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
      toast({ title: "Empleado actualizado" });
    } else {
      const { error } = await supabase.from("empleados").insert(form);
      if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
      toast({ title: "Empleado registrado" });
    }

    setDialogOpen(false);
    setEditing(null);
    setForm({ nombre: "", cedula: "", cargo: "", telefono: "", rfid_key: "" });
    fetchEmpleados();
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("empleados").delete().eq("id", id);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Empleado eliminado" });
    fetchEmpleados();
  };

  const handleEdit = (emp: Empleado) => {
    setEditing(emp);
    setForm({ nombre: emp.nombre, cedula: emp.cedula, cargo: emp.cargo, telefono: emp.telefono || "", rfid_key: emp.rfid_key || "" });
    setDialogOpen(true);
  };

  const handleListenUID = async () => {
    setListening(true);
    toast({ title: "Escuchando...", description: "Pase la tarjeta por el lector ESP32" });

    // Poll for new scanned UID
    const startTime = Date.now();
    const interval = setInterval(async () => {
      if (Date.now() - startTime > 15000) {
        clearInterval(interval);
        setListening(false);
        toast({ title: "Tiempo agotado", description: "No se detectó ninguna tarjeta", variant: "destructive" });
        return;
      }

      const { data } = await supabase
        .from("scanned_uids")
        .select("uid, created_at")
        .order("created_at", { ascending: false })
        .limit(1);

      if (data && data.length > 0) {
        const scanned = data[0];
        const scannedTime = new Date(scanned.created_at).getTime();
        if (scannedTime > startTime - 2000) {
          clearInterval(interval);
          setListening(false);
          setForm((prev) => ({ ...prev, rfid_key: scanned.uid }));
          toast({ title: "Tarjeta detectada", description: `UID: ${scanned.uid}` });
        }
      }
    }, 1000);
  };

  const filtered = empleados.filter((e) =>
    e.nombre.toLowerCase().includes(search.toLowerCase()) ||
    e.cedula.includes(search)
  );

  return (
    <div className="space-y-6 pt-12 md:pt-0">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Empleados</h2>
          <p className="text-muted-foreground text-sm">Gestiona tu equipo de trabajo</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) { setEditing(null); setForm({ nombre: "", cedula: "", cargo: "", telefono: "", rfid_key: "" }); } }}>
          <DialogTrigger asChild>
            <Button className="gradient-primary text-primary-foreground border-0">
              <Plus size={16} className="mr-2" /> Nuevo Empleado
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-card border-border">
            <DialogHeader>
              <DialogTitle className="text-foreground">{editing ? "Editar" : "Registrar"} Empleado</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div><Label className="text-muted-foreground">Nombre</Label><Input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} className="bg-muted border-border" /></div>
              <div><Label className="text-muted-foreground">Cédula</Label><Input value={form.cedula} onChange={(e) => setForm({ ...form, cedula: e.target.value })} className="bg-muted border-border" /></div>
              <div><Label className="text-muted-foreground">Cargo</Label><Input value={form.cargo} onChange={(e) => setForm({ ...form, cargo: e.target.value })} className="bg-muted border-border" /></div>
              <div><Label className="text-muted-foreground">Teléfono</Label><Input value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} className="bg-muted border-border" /></div>
              <div>
                <Label className="text-muted-foreground">Tarjeta RFID</Label>
                <div className="flex gap-2">
                  <Input value={form.rfid_key} onChange={(e) => setForm({ ...form, rfid_key: e.target.value })} className="bg-muted border-border" readOnly placeholder="Escanee la tarjeta..." />
                  <Button type="button" variant="outline" onClick={handleListenUID} disabled={listening} className="border-border shrink-0">
                    <CreditCard size={16} className="mr-1" /> {listening ? "Esperando..." : "Escanear"}
                  </Button>
                </div>
              </div>
              <Button onClick={handleSave} className="w-full gradient-primary text-primary-foreground border-0">
                {editing ? "Actualizar" : "Registrar"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Buscar por nombre o cédula..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10 bg-card border-border"
        />
      </div>

      <div className="grid gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map((emp) => (
          <div key={emp.id} className="glass-card p-5 space-y-3">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary font-bold text-lg">
                  {emp.nombre.charAt(0)}
                </div>
                <div>
                  <p className="font-semibold text-foreground">{emp.nombre}</p>
                  <p className="text-xs text-muted-foreground">{emp.cargo}</p>
                </div>
              </div>
              <div className="flex gap-1">
                <button onClick={() => handleEdit(emp)} className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                  <Edit size={14} />
                </button>
                <button onClick={() => handleDelete(emp.id)} className="p-2 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
            <div className="space-y-1 text-sm">
              <p className="text-muted-foreground">Cédula: <span className="text-foreground">{emp.cedula}</span></p>
              {emp.telefono && <p className="text-muted-foreground">Tel: <span className="text-foreground">{emp.telefono}</span></p>}
              <p className="text-muted-foreground">RFID: <span className={emp.rfid_key ? "text-success" : "text-destructive"}>{emp.rfid_key || "Sin asignar"}</span></p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
