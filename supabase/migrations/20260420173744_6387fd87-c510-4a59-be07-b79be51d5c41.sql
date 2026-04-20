CREATE TABLE public.foto_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'pending',
  foto_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.foto_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to foto_requests"
ON public.foto_requests FOR ALL
USING (true) WITH CHECK (true);

CREATE INDEX idx_foto_requests_status_created ON public.foto_requests(status, created_at DESC);