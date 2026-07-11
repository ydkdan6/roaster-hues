import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const DecisionSchema = z.object({
  leaveId: z.string().uuid(),
  decision: z.enum(["approved", "rejected"]),
  adminNote: z.string().optional().default(""),
  coverUserId: z.string().uuid().optional(),
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

    const { data: updated, error: updErr } = await supabase
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

    const { data: profile } = await supabase
      .from("profiles")
      .select("email, full_name")
      .eq("id", updated.user_id)
      .single();

    // If approved and a cover staff was specified, auto-assign duty coverage
    // for each day of the leave period.
    let coverageAssigned = 0;
    if (data.decision === "approved" && data.coverUserId) {
      const start = new Date(updated.start_date);
      const end = new Date(updated.end_date);
      const rows: Array<{ user_id: string; duty_date: string; shift: string; notes: string; created_by: string }> = [];
      const noteName = profile?.full_name || profile?.email || "colleague";
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        rows.push({
          user_id: data.coverUserId,
          duty_date: d.toISOString().slice(0, 10),
          shift: "Coverage",
          notes: `Covering for ${noteName} (${updated.leave_type} leave)`,
          created_by: userId,
        });
      }
      if (rows.length) {
        const { error: covErr } = await supabase.from("duty_roster").insert(rows);
        if (!covErr) coverageAssigned = rows.length;
        else console.error("Coverage insert failed", covErr);
      }
    }

    const recipient = profile?.email;
    if (!recipient) return { ok: true, emailed: false, coverageAssigned };

    const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
    const RESEND_API_KEY = process.env.RESEND_API_KEY;
    if (!LOVABLE_API_KEY || !RESEND_API_KEY) {
      return { ok: true, emailed: false, coverageAssigned, reason: "email_not_configured" };
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
      return { ok: true, emailed, coverageAssigned };
    } catch (e) {
      console.error("Resend fetch failed", e);
      return { ok: true, emailed: false, coverageAssigned };
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

    const { error } = await supabase
      .from("user_roles")
      .insert({ user_id: data.targetUserId, role: "admin" });
    if (error && !error.message.includes("duplicate")) throw new Error(error.message);
    return { ok: true };
  });