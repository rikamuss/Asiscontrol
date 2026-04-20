import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { Plus, Edit, Trash2, CreditCard, Search, Camera, Upload, X, Cpu } from "lucide-react";

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
  const [requestingPhoto, setRequestingPhoto] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchEmpleados = async () => {
    const { data } = await supabase.from("empleados").select("*").order("nombre");
    if (data) setEmpleados(data);
  };

  useEffect(() => { fetchEmpleados(); }, []);

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: 640, height: 480 } });
      streamRef.current = stream;
      setCameraActive(true);
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      }, 100);
    } catch {
      toast({ title: "Error", description: "No se pudo acceder a la cámara", variant: "destructive" });
    }
  };

  const capturePhoto = () => {
    if (!videoRef.current) return;
    const canvas = document.createElement("canvas");
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    canvas.getContext("2d")?.drawImage(videoRef.current, 0, 0);
    canvas.toBlob((blob) => {
      if (blob) {
        setPhotoFile(new File([blob], "foto.jpg", { type: "image/jpeg" }));
        setPhotoPreview(canvas.toDataURL("image/jpeg"));
        stopCamera();
      }
    }, "image/jpeg", 0.85);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Error", description: "Solo se permiten imágenes", variant: "destructive" });
      return;
    }
    setPhotoFile(file);
    const reader = new FileReader();
    reader.onload = () => setPhotoPreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const removePhoto = () => {
    setPhotoPreview(null);
    setPhotoFile(null);
    stopCamera();
  };

  const uploadPhoto = async (empleadoId: string): Promise<string | null> => {
    if (!photoFile) return null;
    const ext = photoFile.name.split(".").pop() || "jpg";
    const fileName = `empleados/${empleadoId}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("asistencias").upload(fileName, photoFile, { contentType: photoFile.type, upsert: true });
    if (error) {
      console.error("Upload error:", error);
      return null;
    }
    const { data: urlData } = supabase.storage.from("asistencias").getPublicUrl(fileName);
    return urlData.publicUrl;
  };

  const handleSave = async () => {
    if (!form.nombre || !form.cedula || !form.cargo) {
      toast({ title: "Error", description: "Nombre, cédula y cargo son requeridos", variant: "destructive" });
      return;
    }

    if (editing) {
      let foto_url = editing.foto_url;
      if (photoFile) {
        const url = await uploadPhoto(editing.id);
        if (url) foto_url = url;
      } else if (photoPreview && photoPreview !== editing.foto_url) {
        // Photo URL from ESP32 camera (already uploaded)
        foto_url = photoPreview;
      }
      const { error } = await supabase.from("empleados").update({ ...form, foto_url }).eq("id", editing.id);
      if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
      toast({ title: "Empleado actualizado" });
    } else {
      // For new employee, check if we have a photo URL from ESP32
      const insertData: any = { ...form };
      if (photoPreview && !photoFile) {
        insertData.foto_url = photoPreview; // ESP32 photo URL
      }
      const { data: inserted, error } = await supabase.from("empleados").insert(insertData).select("id").single();
      if (error || !inserted) { toast({ title: "Error", description: error?.message || "Error al registrar", variant: "destructive" }); return; }
      if (photoFile) {
        const url = await uploadPhoto(inserted.id);
        if (url) {
          await supabase.from("empleados").update({ foto_url: url }).eq("id", inserted.id);
        }
      }
      toast({ title: "Empleado registrado" });
    }

    resetForm();
    fetchEmpleados();
  };

  const resetForm = () => {
    setDialogOpen(false);
    setEditing(null);
    setForm({ nombre: "", cedula: "", cargo: "", telefono: "", rfid_key: "" });
    setPhotoPreview(null);
    setPhotoFile(null);
    stopCamera();
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
    setPhotoPreview(emp.foto_url || null);
    setPhotoFile(null);
    setDialogOpen(true);
  };

  const handleListenUID = async () => {
    setListening(true);
    toast({ title: "Escuchando RFID...", description: "Pase la tarjeta por el lector ESP32" });

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

  const handleRequestPhotoFromESP32 = async () => {
    setRequestingPhoto(true);
    toast({ title: "Solicitando foto...", description: "El ESP32 tomará la foto en unos segundos" });

    const { data: req, error: reqErr } = await supabase.functions.invoke("request-photo");
    if (reqErr || !req?.request_id) {
      setRequestingPhoto(false);
      toast({ title: "Error", description: "No se pudo solicitar la foto", variant: "destructive" });
      return;
    }

    const requestId = req.request_id;
    const startTime = Date.now();
    const interval = setInterval(async () => {
      if (Date.now() - startTime > 20000) {
        clearInterval(interval);
        setRequestingPhoto(false);
        toast({ title: "Tiempo agotado", description: "El ESP32 no respondió", variant: "destructive" });
        return;
      }

      const { data } = await supabase
        .from("foto_requests")
        .select("status, foto_url")
        .eq("id", requestId)
        .maybeSingle();

      if (data?.status === "done" && data.foto_url) {
        clearInterval(interval);
        setRequestingPhoto(false);
        setPhotoPreview(data.foto_url);
        setPhotoFile(null);
        toast({ title: "Foto recibida del ESP32" });
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
        <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) resetForm(); else setDialogOpen(true); }}>
          <DialogTrigger asChild>
            <Button className="gradient-primary text-primary-foreground border-0">
              <Plus size={16} className="mr-2" /> Nuevo Empleado
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-card border-border max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-foreground">{editing ? "Editar" : "Registrar"} Empleado</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              {/* Photo section */}
              <div>
                <Label className="text-muted-foreground">Foto del empleado</Label>
                <div className="mt-2">
                  {cameraActive ? (
                    <div className="space-y-2">
                      <video ref={videoRef} autoPlay playsInline muted className="w-full rounded-lg border border-border" />
                      <div className="flex gap-2">
                        <Button type="button" onClick={capturePhoto} className="flex-1 gradient-primary text-primary-foreground border-0">
                          <Camera size={16} className="mr-2" /> Capturar
                        </Button>
                        <Button type="button" variant="outline" onClick={stopCamera} className="border-border">
                          <X size={16} />
                        </Button>
                      </div>
                    </div>
                  ) : photoPreview ? (
                    <div className="relative inline-block">
                      <img src={photoPreview} alt="Preview" className="w-32 h-32 rounded-xl object-cover border border-border" />
                      <button onClick={removePhoto} className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full p-1">
                        <X size={12} />
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" variant="outline" onClick={startCamera} className="border-border">
                        <Camera size={16} className="mr-2" /> Cámara
                      </Button>
                      <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()} className="border-border">
                        <Upload size={16} className="mr-2" /> Subir archivo
                      </Button>
                      <Button type="button" variant="outline" onClick={handleRequestPhotoFromESP32} disabled={requestingPhoto} className="border-border">
                        <Cpu size={16} className="mr-2" /> {requestingPhoto ? "Esperando ESP32..." : "Foto desde ESP32"}
                      </Button>
                      <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileSelect} className="hidden" />
                    </div>
                  )}
                </div>
              </div>

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
                {emp.foto_url ? (
                  <img src={emp.foto_url} alt={emp.nombre} className="w-12 h-12 rounded-xl object-cover" />
                ) : (
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary font-bold text-lg">
                    {emp.nombre.charAt(0)}
                  </div>
                )}
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
