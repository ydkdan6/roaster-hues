import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const DecisionSchema = z.object({
  leaveId: z.string().uuid(),
  decision: z.enum(["approved", "rejected"]),
  adminNote: z.string().optional().default(""),
});

export const decideLeaveRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => DecisionSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: isAdmin, error: roleErr } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    if (roleErr) throw new Error(roleErr.message);
    if (!isAdmin) throw new Error("Forbidden: admin only");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: updated, error: updErr } = await supabaseAdmin
      .from("leave_requests")
      .update({
        status: data.decision,
        admin_note: data.adminNote ?? "",
        reviewed_by: userId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", data.leaveId)
      .select("id, user_id, leave_type, start_date, end_date, status, admin_note")
      .single();
    if (updErr || !updated) throw new Error(updErr?.message ?? "Update failed");

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("email, full_name")
      .eq("id", updated.user_id)
      .single();

    const recipient = profile?.email;
    if (!recipient) return { ok: true, emailed: false };

    const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
    const RESEND_API_KEY = process.env.RESEND_API_KEY;
    if (!LOVABLE_API_KEY || !RESEND_API_KEY) {
      return { ok: true, emailed: false, reason: "email_not_configured" };
    }

    const isApproved = updated.status === "approved";
    const subject = isApproved
      ? "Your leave request has been approved"
      : "Your leave request was not approved";
    const color = isApproved ? "#16a34a" : "#b91c1c";
    const heading = isApproved ? "Leave approved" : "Leave rejected";
    const html = `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;background:#fafaf6;color:#1f2a24">
        <h2 style="color:${color};margin:0 0 12px 0">${heading}</h2>
        <p>Hi ${profile?.full_name || "there"},</p>
        <p>Your <b>${updated.leave_type}</b> leave request from
          <b>${updated.start_date}</b> to <b>${updated.end_date}</b> has been
          <b style="color:${color}">${updated.status}</b>.</p>
        ${updated.admin_note ? `<p style="background:#fff;border-left:3px solid ${color};padding:10px 12px"><b>Note from admin:</b><br/>${updated.admin_note}</p>` : ""}
        <p style="color:#4b5563;font-size:12px;margin-top:24px">Staff Leave & Duty Roster System</p>
      </div>`;

    try {
      const res = await fetch("https://connector-gateway.lovable.dev/resend/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "X-Connection-Api-Key": RESEND_API_KEY,
        },
        body: JSON.stringify({
          from: "Leave System <onboarding@resend.dev>",
          to: [recipient],
          subject,
          html,
        }),
      });
      const emailed = res.ok;
      if (!emailed) {
        const body = await res.text();
        console.error("Resend error:", res.status, body);
      }
      return { ok: true, emailed };
    } catch (e) {
      console.error("Resend fetch failed", e);
      return { ok: true, emailed: false };
    }
  });

const PromoteSchema = z.object({ targetUserId: z.string().uuid() });

export const promoteToAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => PromoteSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden: admin only");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: data.targetUserId, role: "admin" });
    if (error && !error.message.includes("duplicate")) throw new Error(error.message);
    return { ok: true };
  });