ALTER TABLE public.asistencias REPLICA IDENTITY FULL;
ALTER TABLE public.empleados REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.asistencias;
ALTER PUBLICATION supabase_realtime ADD TABLE public.empleados;