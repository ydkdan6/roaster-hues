import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Leaf, CalendarCheck, ShieldCheck, Users } from "lucide-react";
import authHero from "@/assets/auth-hero.jpg";

export const Route = createFileRoute("/auth")({
  ssr: false,
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) navigate({ to: "/dashboard" });
    });
  }, [navigate]);

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Signed in");
    navigate({ to: "/dashboard" });
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/dashboard`,
        data: { full_name: fullName },
      },
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Account created. You can sign in.");
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-background">
      {/* Left: auth form */}
      <div className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-md">
          <div className="flex items-center gap-2.5 mb-8">
            <div className="w-10 h-10 rounded-xl bg-primary text-primary-foreground grid place-items-center shadow-sm">
              <Leaf className="w-5 h-5" />
            </div>
            <div>
              <div className="font-semibold text-foreground leading-tight">Leave &amp; Duty Roster</div>
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Staff workspace</div>
            </div>
          </div>
          <div className="mb-6">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Welcome back</h1>
            <p className="text-sm text-muted-foreground mt-1.5">
              Sign in to apply for leave, manage approvals, and view your duty roster.
            </p>
          </div>
          <Card className="border-border/70 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Account access</CardTitle>
              <CardDescription>Staff and administrators</CardDescription>
            </CardHeader>
            <CardContent>
            <Tabs defaultValue="signin">
              <TabsList className="grid grid-cols-2 w-full">
                <TabsTrigger value="signin">Sign in</TabsTrigger>
                <TabsTrigger value="signup">Sign up</TabsTrigger>
              </TabsList>
              <TabsContent value="signin">
                <form onSubmit={handleSignIn} className="space-y-4 pt-4">
                  <div className="space-y-2">
                    <Label>Email</Label>
                    <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Password</Label>
                    <Input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? "Signing in..." : "Sign in"}
                  </Button>
                </form>
              </TabsContent>
              <TabsContent value="signup">
                <form onSubmit={handleSignUp} className="space-y-4 pt-4">
                  <div className="space-y-2">
                    <Label>Full name</Label>
                    <Input required value={fullName} onChange={(e) => setFullName(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Email</Label>
                    <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Password</Label>
                    <Input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? "Creating..." : "Create staff account"}
                  </Button>
                  <p className="text-xs text-muted-foreground text-center">
                    New accounts are created as staff. Admins are assigned by an existing admin.
                  </p>
                </form>
              </TabsContent>
            </Tabs>
            </CardContent>
          </Card>
          <p className="text-[11px] text-muted-foreground text-center mt-6">
            By continuing, you agree to your organisation's leave and duty policies.
          </p>
        </div>
      </div>

      {/* Right: hero illustration */}
      <div className="hidden lg:flex relative border-l border-border bg-secondary/40 overflow-hidden">
        <img
          src={authHero}
          alt="Team planning a duty roster around a shared calendar"
          width={1024}
          height={1408}
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-background/40" />
        <div className="relative z-10 flex flex-col justify-end p-10 w-full">
          <div className="bg-card/95 backdrop-blur border border-border rounded-2xl p-6 shadow-sm max-w-md">
            <div className="text-[11px] uppercase tracking-widest text-primary font-medium">
              Built for teams
            </div>
            <h2 className="text-xl font-semibold text-foreground mt-2">
              A calmer way to plan leave and cover duties
            </h2>
            <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
              Staff request time off, supervisors approve in a click, and coverage
              is assigned automatically — with everyone kept in the loop by email.
            </p>
            <ul className="mt-5 space-y-3 text-sm">
              <FeatureRow icon={<CalendarCheck className="w-4 h-4" />} title="Apply for leave">
                Track approval status in real time.
              </FeatureRow>
              <FeatureRow icon={<Users className="w-4 h-4" />} title="Auto-assigned coverage">
                Coverage duties are added to the roster and emailed to the covering staff.
              </FeatureRow>
              <FeatureRow icon={<ShieldCheck className="w-4 h-4" />} title="Role-based access">
                Staff see their own data; admins manage the whole team.
              </FeatureRow>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

function FeatureRow({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <div className="w-8 h-8 shrink-0 rounded-lg bg-primary/10 text-primary grid place-items-center">
        {icon}
      </div>
      <div>
        <div className="font-medium text-foreground text-sm">{title}</div>
        <div className="text-xs text-muted-foreground mt-0.5">{children}</div>
      </div>
    </li>
  );
}