import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const SignInSchema = z.object({
  authIdCode: z.string().trim().regex(/^[A-Za-z0-9]{6}$/, "Auth ID must be 6 letters or numbers"),
  password: z.string().min(1),
});

const RecoverySchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  registeredEmail: z.string().trim().email().max(254),
  department: z.string().trim().max(120).optional().default(""),
  message: z.string().trim().min(10).max(1000),
});

export const signInWithAuthId = createServerFn({ method: "POST" })
  .inputValidator((input) => SignInSchema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("email")
      .eq("auth_id_code", data.authIdCode.toUpperCase())
      .maybeSingle();

    if (profileError || !profile?.email) {
      throw new Error("That Auth ID or password is incorrect.");
    }

    const { createClient } = await import("@supabase/supabase-js");
    const supabasePublic = createClient(
      process.env["SUPABASE_URL"]!,
      process.env["SUPABASE_PUBLISHABLE_KEY"]!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const { data: authData, error: authError } = await supabasePublic.auth.signInWithPassword({
      email: profile.email,
      password: data.password,
    });

    if (authError || !authData.session) {
      throw new Error("That Auth ID or password is incorrect.");
    }

    return { session: authData.session };
  });

export const submitAuthIdRequest = createServerFn({ method: "POST" })
  .inputValidator((input) => RecoverySchema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("auth_id_requests").insert({
      full_name: data.fullName,
      registered_email: data.registeredEmail,
      department: data.department || null,
      message: data.message,
    });

    if (error) throw new Error("We could not send your request. Please try again.");
    return { ok: true };
  });