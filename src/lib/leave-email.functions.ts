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
    // for each day of the leave period, and notify that staff member.
    let coverageAssigned = 0;
    let coverEmailed = false;
    let coverProfile: { email: string; full_name: string } | null = null;
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
      const { data: cp } = await supabase
        .from("profiles")
        .select("email, full_name")
        .eq("id", data.coverUserId)
        .single();
      if (cp?.email) coverProfile = { email: cp.email, full_name: cp.full_name ?? "" };
    }

    const isApproved = updated.status === "approved";
    const staffColor = isApproved ? "#166534" : "#991b1b";
    const staffHeading = isApproved ? "Leave approved" : "Leave rejected";
    const staffSubject = isApproved
      ? "Your leave request has been approved"
      : "Your leave request was not approved";
    const staffHtml = renderEmail({
      accent: staffColor,
      heading: staffHeading,
      greeting: `Hi ${profile?.full_name || "there"},`,
      body: `<p>Your <b>${updated.leave_type}</b> leave request from
          <b>${updated.start_date}</b> to <b>${updated.end_date}</b> has been
          <b style="color:${staffColor}">${updated.status}</b>.</p>` +
        (updated.admin_note
          ? `<p style="background:#f6faf5;border-left:3px solid ${staffColor};padding:10px 12px;margin-top:14px"><b>Note from admin:</b><br/>${updated.admin_note}</p>`
          : ""),
    });

    const staffEmailResult = profile?.email
      ? await sendEmail({ to: profile.email, subject: staffSubject, html: staffHtml })
      : { ok: false, error: "Staff email address is missing" };
    const emailed = staffEmailResult.ok;

    if (coverProfile) {
      const coverHtml = renderEmail({
        accent: "#166534",
        heading: "You've been assigned coverage duty",
        greeting: `Hi ${coverProfile.full_name || "there"},`,
        body: `<p>You have been assigned to cover for
          <b>${profile?.full_name || profile?.email || "a colleague"}</b>
          during their <b>${updated.leave_type}</b> leave from
          <b>${updated.start_date}</b> to <b>${updated.end_date}</b>.</p>
          <p>${coverageAssigned} coverage duty ${coverageAssigned === 1 ? "entry has" : "entries have"} been added to your roster. Please sign in to view details.</p>`,
      });
      const coverEmailResult = await sendEmail({
        to: coverProfile.email,
        subject: `Coverage duty assigned: ${updated.start_date} → ${updated.end_date}`,
        html: coverHtml,
      });
      coverEmailed = coverEmailResult.ok;
    }

    return { ok: true, emailed, coverageAssigned, coverEmailed };
  });

function renderEmail({ accent, heading, greeting, body }: { accent: string; heading: string; greeting: string; body: string }) {
  return `
    <div style="font-family:-apple-system,Segoe UI,Arial,sans-serif;max-width:560px;margin:0 auto;padding:0;background:#ffffff;color:#1f2a24">
      <div style="border:1px solid #e6ece4;border-radius:14px;overflow:hidden">
        <div style="background:#f6faf5;border-bottom:3px solid ${accent};padding:20px 24px">
          <div style="font-size:12px;letter-spacing:.08em;color:#4b5f52;text-transform:uppercase">Leave &amp; Duty Roster</div>
          <h2 style="color:${accent};margin:6px 0 0 0;font-size:20px">${heading}</h2>
        </div>
        <div style="padding:22px 24px;line-height:1.55;font-size:14px">
          <p style="margin:0 0 12px 0">${greeting}</p>
          ${body}
          <p style="color:#6b7a71;font-size:12px;margin-top:26px">Staff Leave &amp; Duty Roster System</p>
        </div>
      </div>
    </div>`;
}

async function sendEmail({ to, subject, html }: { to: string; subject: string; html: string }): Promise<{ ok: boolean; error?: string }> {
  const serviceId = process.env.EMAILJS_SERVICE_ID;
  const templateId = process.env.EMAILJS_TEMPLATE_ID;
  const publicKey = process.env.EMAILJS_PUBLIC_KEY;
  const privateKey = process.env.EMAILJS_PRIVATE_KEY;
  if (!serviceId || !templateId || !publicKey || !privateKey) {
    console.error("EmailJS not configured: missing one of EMAILJS_SERVICE_ID/TEMPLATE_ID/PUBLIC_KEY/PRIVATE_KEY");
    return { ok: false, error: "EmailJS is not configured" };
  }
  try {
    const res = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        service_id: serviceId,
        template_id: templateId,
        user_id: publicKey,
        accessToken: privateKey,
        template_params: {
          email: to,
          subject,
          message_html: html,
          from_name: "Leave & Duty Roster",
        },
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error(`EmailJS error [${res.status}] to=${to}:`, body);
      return { ok: false, error: body || `EmailJS returned ${res.status}` };
    }
    return { ok: true };
  } catch (e) {
    console.error("EmailJS fetch failed", e);
    return { ok: false, error: e instanceof Error ? e.message : "EmailJS request failed" };
  }
}

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

const DemoteSchema = z.object({ targetUserId: z.string().uuid() });

export const demoteFromAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => DemoteSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden: admin only");
    if (data.targetUserId === userId) throw new Error("You cannot remove your own admin role");

    const { error } = await supabase
      .from("user_roles")
      .delete()
      .eq("user_id", data.targetUserId)
      .eq("role", "admin");
    if (error) throw new Error(error.message);
    return { ok: true };
  });