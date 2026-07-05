import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

interface Leave {
  id: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  reason: string;
  status: "pending" | "approved" | "rejected";
  admin_note: string | null;
  created_at: string;
}
interface Duty {
  id: string;
  duty_date: string;
  shift: string;
  notes: string | null;
}

function Dashboard() {
  const { user, isAdmin } = Route.useRouteContext();
  const navigate = useNavigate();
  const [leaves, setLeaves] = useState<Leave[]>([]);
  const [duties, setDuties] = useState<Duty[]>([]);
  const [leaveType, setLeaveType] = useState("Annual");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isAdmin) navigate({ to: "/admin" });
  }, [isAdmin, navigate]);

  async function loadData() {
    const [l, d] = await Promise.all([
      supabase.from("leave_requests").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
      supabase.from("duty_roster").select("*").eq("user_id", user.id).order("duty_date", { ascending: true }),
    ]);
    if (l.data) setLeaves(l.data as Leave[]);
    if (d.data) setDuties(d.data as Duty[]);
  }
  useEffect(() => { loadData(); }, []);

  async function submitLeave(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    const { error } = await supabase.from("leave_requests").insert({
      user_id: user.id, leave_type: leaveType, start_date: startDate, end_date: endDate, reason,
    });
    setSubmitting(false);
    if (error) return toast.error(error.message);
    toast.success("Leave request submitted");
    setStartDate(""); setEndDate(""); setReason("");
    loadData();
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
            <div className="w-9 h-9 rounded-lg bg-primary text-primary-foreground grid place-items-center font-bold">LR</div>
            <div>
              <h1 className="font-semibold text-foreground">Staff Dashboard</h1>
              <p className="text-xs text-muted-foreground">{user.email}</p>
            </div>
          </div>
          <Button variant="outline" onClick={signOut}>Sign out</Button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8 grid lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle>Apply for leave</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={submitLeave} className="space-y-4">
              <div className="space-y-2">
                <Label>Leave type</Label>
                <Select value={leaveType} onValueChange={setLeaveType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["Annual","Sick","Casual","Maternity","Unpaid"].map(t => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>From</Label>
                  <Input type="date" required value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>To</Label>
                  <Input type="date" required value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Reason</Label>
                <Textarea required value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
              </div>
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? "Submitting..." : "Submit request"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>My leave requests</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {leaves.length === 0 && <p className="text-sm text-muted-foreground">No requests yet.</p>}
              {leaves.map((l) => (
                <div key={l.id} className="p-3 rounded-lg border border-border bg-card">
                  <div className="flex items-center justify-between">
                    <div className="font-medium">{l.leave_type}</div>
                    <StatusBadge status={l.status} />
                  </div>
                  <div className="text-sm text-muted-foreground mt-1">{l.start_date} → {l.end_date}</div>
                  <div className="text-sm mt-1">{l.reason}</div>
                  {l.admin_note && <div className="text-xs mt-2 p-2 rounded bg-secondary text-secondary-foreground">Admin: {l.admin_note}</div>}
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>My duty roster</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {duties.length === 0 && <p className="text-sm text-muted-foreground">No duties scheduled.</p>}
              {duties.map((d) => (
                <div key={d.id} className="flex items-center justify-between p-2 rounded border border-border">
                  <div>
                    <div className="font-medium">{d.duty_date}</div>
                    {d.notes && <div className="text-xs text-muted-foreground">{d.notes}</div>}
                  </div>
                  <Badge variant="secondary">{d.shift}</Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending: "bg-muted text-muted-foreground",
    approved: "bg-primary text-primary-foreground",
    rejected: "bg-destructive text-destructive-foreground",
  };
  return <span className={`text-xs px-2 py-1 rounded-full ${map[status]}`}>{status}</span>;
}