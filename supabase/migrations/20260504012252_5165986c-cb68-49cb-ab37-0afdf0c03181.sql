
-- Empleados
DROP POLICY IF EXISTS "Allow all access to empleados" ON public.empleados;
CREATE POLICY "Authenticated full access empleados" ON public.empleados
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Asistencias
DROP POLICY IF EXISTS "Allow all access to asistencias" ON public.asistencias;
CREATE POLICY "Authenticated full access asistencias" ON public.asistencias
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Foto requests
DROP POLICY IF EXISTS "Allow all access to foto_requests" ON public.foto_requests;
CREATE POLICY "Authenticated full access foto_requests" ON public.foto_requests
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Scanned uids
DROP POLICY IF EXISTS "Allow all access to scanned_uids" ON public.scanned_uids;
CREATE POLICY "Authenticated full access scanned_uids" ON public.scanned_uids
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
