ALTER TABLE public.asistencias DROP CONSTRAINT IF EXISTS asistencias_estado_check;
ALTER TABLE public.asistencias ADD CONSTRAINT asistencias_estado_check
  CHECK (estado = ANY (ARRAY['presente'::text, 'retardo'::text, 'falta'::text, 'salida'::text, 'salida_temprana'::text]));