import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { decideLeaveRequest, promoteToAdmin } from "@/lib/leave-email.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin")({
  component: Admin,
});

interface Leave {
  id: string; user_id: string; leave_type: string;
  start_date: string; end_date: string; reason: string;
  status: "pending" | "approved" | "rejected"; admin_note: string | null; created_at: string;
}
interface Profile { id: string; full_name: string; email: string; }
interface Duty { id: string; user_id: string; duty_date: string; shift: string; notes: string | null; }
interface Role { user_id: string; role: string; }

function Admin() {
  const { user, isAdmin } = Route.useRouteContext();
  const navigate = useNavigate();
  const decide = useServerFn(decideLeaveRequest);
  const promote = useServerFn(promoteToAdmin);

  const [leaves, setLeaves] = useState<Leave[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [duties, setDuties] = useState<Duty[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  // roster form
  const [rUser, setRUser] = useState("");
  const [rDate, setRDate] = useState("");
  const [rShift, setRShift] = useState("Morning");
  const [rNotes, setRNotes] = useState("");

  useEffect(() => {
    if (!isAdmin) navigate({ to: "/dashboard" });
  }, [isAdmin, navigate]);

  async function load() {
    const [l, p, d, r] = await Promise.all([
      supabase.from("leave_requests").select("*").order("created_at", { ascending: false }),
      supabase.from("profiles").select("id, full_name, email"),
      supabase.from("duty_roster").select("*").order("duty_date"),
      supabase.from("user_roles").select("user_id, role"),
    ]);
    if (l.data) setLeaves(l.data as Leave[]);
    if (p.data) setProfiles(p.data as Profile[]);
    if (d.data) setDuties(d.data as Duty[]);
    if (r.data) setRoles(r.data as Role[]);
  }
  useEffect(() => { load(); }, []);

  const profileMap = new Map(profiles.map((p) => [p.id, p]));
  const adminIds = new Set(roles.filter((r) => r.role === "admin").map((r) => r.user_id));

  async function handleDecision(leaveId: string, decision: "approved" | "rejected") {
    setBusy(leaveId);
    try {
      const res = await decide({ data: { leaveId, decision, adminNote: notes[leaveId] ?? "" } });
      toast.success(`Leave ${decision}${res.emailed ? " — email sent" : ""}`);
      await load();
    } catch (e: any) {
      toast.error(e.message ?? "Failed");
    } finally {
      setBusy(null);
    }
  }

  async function addRoster(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase.from("duty_roster").insert({
      user_id: rUser, duty_date: rDate, shift: rShift, notes: rNotes, created_by: user.id,
    });
    if (error) return toast.error(error.message);
    toast.success("Duty added");
    setRUser(""); setRDate(""); setRNotes("");
    load();
  }

  async function removeRoster(id: string) {
    const { error } = await supabase.from("duty_roster").delete().eq("id", id);
    if (error) return toast.error(error.message);
    load();
  }

  async function handlePromote(targetId: string) {
    try {
      await promote({ data: { targetUserId: targetId } });
      toast.success("User promoted to admin");
      load();
    } catch (e: any) { toast.error(e.message); }
  }

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* <div className="w-9 h-9 rounded-lg bg-primary text-primary-foreground grid place-items-center font-bold">LR</div> */}
            <div>
              <h1 className="font-semibold">Admin / Supervisor</h1>
              <p className="text-xs text-muted-foreground">{user.email}</p>
            </div>
          </div>
          <Button variant="outline" onClick={signOut}>Sign out</Button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        <Tabs defaultValue="leaves">
          <TabsList>
            <TabsTrigger value="leaves">Leave Requests</TabsTrigger>
            <TabsTrigger value="roster">Duty Roster</TabsTrigger>
            <TabsTrigger value="reports">Reports</TabsTrigger>
            <TabsTrigger value="users">Users</TabsTrigger>
          </TabsList>

          <TabsContent value="leaves" className="space-y-3 mt-4">
            {leaves.length === 0 && <p className="text-sm text-muted-foreground">No leave requests.</p>}
            {leaves.map((l) => {
              const p = profileMap.get(l.user_id);
              return (
                <Card key={l.id}>
                  <CardContent className="pt-6 space-y-3">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="font-medium">{p?.full_name || p?.email || l.user_id}</div>
                        <div className="text-xs text-muted-foreground">{p?.email}</div>
                        <div className="mt-2 text-sm">
                          <b>{l.leave_type}</b> · {l.start_date} → {l.end_date}
                        </div>
                        <div className="text-sm text-muted-foreground mt-1">{l.reason}</div>
                      </div>
                      <Badge variant={l.status === "approved" ? "default" : l.status === "rejected" ? "destructive" : "secondary"}>
                        {l.status}
                      </Badge>
                    </div>
                    {l.status === "pending" && (
                      <div className="space-y-2 pt-2 border-t border-border">
                        <Textarea
                          placeholder="Optional note to staff (included in email)"
                          value={notes[l.id] ?? ""}
                          onChange={(e) => setNotes({ ...notes, [l.id]: e.target.value })}
                        />
                        <div className="flex gap-2">
                          <Button disabled={busy === l.id} onClick={() => handleDecision(l.id, "approved")}>
                            Approve
                          </Button>
                          <Button variant="destructive" disabled={busy === l.id} onClick={() => handleDecision(l.id, "rejected")}>
                            Reject
                          </Button>
                        </div>
                      </div>
                    )}
                    {l.admin_note && l.status !== "pending" && (
                      <div className="text-xs p-2 rounded bg-secondary text-secondary-foreground">Note: {l.admin_note}</div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </TabsContent>

          <TabsContent value="roster" className="mt-4 space-y-6">
            <Card>
              <CardHeader><CardTitle>Generate duty</CardTitle></CardHeader>
              <CardContent>
                <form onSubmit={addRoster} className="grid md:grid-cols-4 gap-3 items-end">
                  <div className="space-y-2">
                    <Label>Staff</Label>
                    <Select value={rUser} onValueChange={setRUser}>
                      <SelectTrigger><SelectValue placeholder="Select staff" /></SelectTrigger>
                      <SelectContent>
                        {profiles.filter(p => !adminIds.has(p.id)).map((p) => (
                          <SelectItem key={p.id} value={p.id}>{p.full_name || p.email}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Date</Label>
                    <Input type="date" required value={rDate} onChange={(e) => setRDate(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Shift</Label>
                    <Select value={rShift} onValueChange={setRShift}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {["Morning","Afternoon","Night"].map(s => (<SelectItem key={s} value={s}>{s}</SelectItem>))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button type="submit" disabled={!rUser || !rDate}>Add duty</Button>
                  <div className="md:col-span-4 space-y-2">
                    <Label>Notes (optional)</Label>
                    <Input value={rNotes} onChange={(e) => setRNotes(e.target.value)} />
                  </div>
                </form>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Roster</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {duties.length === 0 && <p className="text-sm text-muted-foreground">No duties yet.</p>}
                {duties.map((d) => {
                  const p = profileMap.get(d.user_id);
                  return (
                    <div key={d.id} className="flex items-center justify-between p-3 rounded border border-border">
                      <div>
                        <div className="font-medium">{p?.full_name || p?.email}</div>
                        <div className="text-xs text-muted-foreground">{d.duty_date} · {d.shift}{d.notes ? ` · ${d.notes}`:""}</div>
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => removeRoster(d.id)}>Remove</Button>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="reports" className="mt-4">
            <div className="grid md:grid-cols-4 gap-4">
              <ReportStat label="Total requests" value={leaves.length} />
              <ReportStat label="Approved" value={leaves.filter(l => l.status === "approved").length} />
              <ReportStat label="Rejected" value={leaves.filter(l => l.status === "rejected").length} />
              <ReportStat label="Pending" value={leaves.filter(l => l.status === "pending").length} />
            </div>
            <Card className="mt-4">
              <CardHeader><CardTitle>Leave summary by staff</CardTitle></CardHeader>
              <CardContent className="space-y-1">
                {profiles.map((p) => {
                  const mine = leaves.filter((l) => l.user_id === p.id);
                  if (mine.length === 0) return null;
                  return (
                    <div key={p.id} className="flex justify-between text-sm py-1 border-b border-border last:border-0">
                      <span>{p.full_name || p.email}</span>
                      <span className="text-muted-foreground">
                        {mine.filter(l => l.status === "approved").length} approved ·
                        {" "}{mine.filter(l => l.status === "rejected").length} rejected ·
                        {" "}{mine.filter(l => l.status === "pending").length} pending
                      </span>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="users" className="mt-4">
            <Card>
              <CardHeader><CardTitle>User management</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {profiles.map((p) => (
                  <div key={p.id} className="flex items-center justify-between p-3 rounded border border-border">
                    <div>
                      <div className="font-medium">{p.full_name || "(no name)"}</div>
                      <div className="text-xs text-muted-foreground">{p.email}</div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant={adminIds.has(p.id) ? "default" : "secondary"}>
                        {adminIds.has(p.id) ? "admin" : "staff"}
                      </Badge>
                      {!adminIds.has(p.id) && (
                        <Button size="sm" onClick={() => handlePromote(p.id)}>Promote to admin</Button>
                      )}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

function ReportStat({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="text-3xl font-bold text-primary">{value}</div>
        <div className="text-xs text-muted-foreground mt-1">{label}</div>
      </CardContent>
    </Card>
  );
}