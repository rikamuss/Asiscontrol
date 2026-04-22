-- Añadir columnas para soportar tipo de pase, jornada y minutos de desviación
ALTER TABLE public.asistencias
  ADD COLUMN IF NOT EXISTS tipo text NOT NULL DEFAULT 'entrada',
  ADD COLUMN IF NOT EXISTS jornada text,
  ADD COLUMN IF NOT EXISTS minutos_desviacion integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_asistencias_emp_fecha ON public.asistencias (empleado_id, fecha_hora DESC);