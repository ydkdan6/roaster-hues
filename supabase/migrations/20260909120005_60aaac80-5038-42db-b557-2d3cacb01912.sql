REVOKE INSERT ON public.auth_id_requests FROM anon;
DROP POLICY IF EXISTS "anyone can submit auth id requests" ON public.auth_id_requests;
CREATE POLICY "signed-in admins can submit auth id requests" ON public.auth_id_requests
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));