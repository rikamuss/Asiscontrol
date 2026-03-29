-- Create empleados table
CREATE TABLE public.empleados (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre TEXT NOT NULL,
  cedula TEXT NOT NULL UNIQUE,
  cargo TEXT NOT NULL,
  telefono TEXT,
  rfid_key TEXT UNIQUE,
  foto_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create asistencias table
CREATE TABLE public.asistencias (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  empleado_id UUID NOT NULL REFERENCES public.empleados(id) ON DELETE CASCADE,
  fecha_hora TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  foto_url TEXT,
  estado TEXT NOT NULL DEFAULT 'presente' CHECK (estado IN ('presente', 'retardo', 'falta')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create scanned_uids table for ESP32 card scanning
CREATE TABLE public.scanned_uids (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  uid TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.empleados ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asistencias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scanned_uids ENABLE ROW LEVEL SECURITY;

-- Public read/write policies (ESP32 needs unauthenticated access)
CREATE POLICY "Allow all access to empleados" ON public.empleados FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to asistencias" ON public.asistencias FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to scanned_uids" ON public.scanned_uids FOR ALL USING (true) WITH CHECK (true);

-- Enable realtime for asistencias
ALTER PUBLICATION supabase_realtime ADD TABLE public.asistencias;

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_empleados_updated_at
  BEFORE UPDATE ON public.empleados
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Create storage bucket for attendance photos
INSERT INTO storage.buckets (id, name, public) VALUES ('asistencias', 'asistencias', true);

CREATE POLICY "Public read access for asistencias bucket" ON storage.objects FOR SELECT USING (bucket_id = 'asistencias');
CREATE POLICY "Allow uploads to asistencias bucket" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'asistencias');

-- Create indexes
CREATE INDEX idx_asistencias_empleado_id ON public.asistencias(empleado_id);
CREATE INDEX idx_asistencias_fecha ON public.asistencias(fecha_hora);
CREATE INDEX idx_empleados_rfid ON public.empleados(rfid_key);