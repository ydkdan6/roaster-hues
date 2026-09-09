CREATE OR REPLACE FUNCTION public.generate_auth_id_code()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  candidate TEXT;
BEGIN
  LOOP
    candidate := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.profiles WHERE auth_id_code = candidate
    );
  END LOOP;
  RETURN candidate;
END;
$$;

ALTER TABLE public.profiles ADD COLUMN auth_id_code TEXT;
UPDATE public.profiles SET auth_id_code = public.generate_auth_id_code() WHERE auth_id_code IS NULL;
ALTER TABLE public.profiles ALTER COLUMN auth_id_code SET NOT NULL;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_auth_id_code_key UNIQUE (auth_id_code);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email, auth_id_code)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''), NEW.email, public.generate_auth_id_code());
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'staff');
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.lookup_email_by_auth_id_code(_code TEXT)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT email
  FROM public.profiles
  WHERE auth_id_code = upper(trim(_code))
  LIMIT 1
$$;
REVOKE EXECUTE ON FUNCTION public.lookup_email_by_auth_id_code(TEXT) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.lookup_email_by_auth_id_code(TEXT) TO anon;

CREATE TABLE public.auth_id_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  registered_email TEXT NOT NULL,
  department TEXT,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'resolved')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT INSERT ON public.auth_id_requests TO anon;
GRANT SELECT, UPDATE ON public.auth_id_requests TO authenticated;
GRANT ALL ON public.auth_id_requests TO service_role;
ALTER TABLE public.auth_id_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone can submit auth id requests" ON public.auth_id_requests
  FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "admins can review auth id requests" ON public.auth_id_requests
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins can resolve auth id requests" ON public.auth_id_requests
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

REVOKE EXECUTE ON FUNCTION public.generate_auth_id_code() FROM PUBLIC, anon, authenticated;