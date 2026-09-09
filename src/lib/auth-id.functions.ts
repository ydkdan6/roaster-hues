import { supabase } from "@/integrations/supabase/client";

export async function assignAuthId() {
  const { data, error } = await supabase.rpc("assign_auth_id");
  if (error) throw error;
  return { authId: data as string };
}

export async function resolveAuthId(authId: string) {
  const { data, error } = await supabase.rpc("resolve_auth_id", {
    p_auth_id: authId,
  });
  if (error) throw error;
  if (!data) throw new Error("Invalid Auth ID or password");
  return { email: data as string };
}

export async function requestAuthIdRecovery(fullName: string, email: string, note?: string) {
  const { data, error } = await supabase.rpc("request_auth_id_recovery", {
    p_full_name: fullName,
    p_email: email,
    p_note: note ?? null,
  });
  if (error) throw error;
  return { sent: true, matched: !!data };
}
