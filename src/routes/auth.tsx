import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { signInWithAuthId, submitAuthIdRequest } from "@/lib/auth.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Leaf, CalendarCheck, ShieldCheck, Users, Copy, Check, LifeBuoy, ArrowLeft } from "lucide-react";
import authHero from "@/assets/auth-hero.jpg";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Sign in | Staff Leave & Duty Roster" },
      { name: "description", content: "Sign in with your six-character Auth ID to manage leave and duty assignments." },
      { property: "og:title", content: "Sign in | Staff Leave & Duty Roster" },
      { property: "og:description", content: "Secure access for staff and administrators managing leave and duty assignments." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const signIn = useServerFn(signInWithAuthId);
  const submitRecovery = useServerFn(submitAuthIdRequest);
  const [loading, setLoading] = useState(false);
  const [authIdCode, setAuthIdCode] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [newAuthId, setNewAuthId] = useState("");
  const [copied, setCopied] = useState(false);
  const [showAuthId, setShowAuthId] = useState(false);
  const [showRecovery, setShowRecovery] = useState(false);
  const [recoveryLoading, setRecoveryLoading] = useState(false);
  const [recovery, setRecovery] = useState({ fullName: "", registeredEmail: "", department: "", message: "" });

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) navigate({ to: "/dashboard" });
    });
  }, [navigate]);

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const { session } = await signIn({ data: { authIdCode, password } });
      await supabase.auth.setSession(session);
      toast.success("Signed in");
      navigate({ to: "/dashboard" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to sign in");
    } finally {
      setLoading(false);
    }
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/dashboard`,
        data: { full_name: fullName },
      },
    });
    if (error) return toast.error(error.message);
    if (!data.user) {
      setLoading(false);
      return toast.error("Account could not be created. Please try again.");
    }
    const { data: profile } = await supabase.from("profiles").select("auth_id_code").eq("id", data.user.id).maybeSingle();
    setLoading(false);
    if (!profile?.auth_id_code) return toast.success("Account created. Sign in once your email is confirmed.");
    setNewAuthId(profile.auth_id_code);
    setShowAuthId(true);
    setPassword("");
    toast.success("Account created");
  }

  async function copyAuthId() {
    await navigator.clipboard.writeText(newAuthId);
    setCopied(true);
    toast.success("Auth ID copied");
    window.setTimeout(() => setCopied(false), 1800);
  }

  async function handleRecovery(e: React.FormEvent) {
    e.preventDefault();
    setRecoveryLoading(true);
    try {
      await submitRecovery({ data: recovery });
      toast.success("Your request was sent to the admin");
      setShowRecovery(false);
      setRecovery({ fullName: "", registeredEmail: "", department: "", message: "" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to send request");
    } finally {
      setRecoveryLoading(false);
    }
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
                    <Label>Auth ID</Label>
                    <Input required maxLength={6} autoCapitalize="characters" value={authIdCode} onChange={(e) => setAuthIdCode(e.target.value.toUpperCase())} placeholder="e.g. A7K2Q9" />
                  </div>
                  <div className="space-y-2">
                    <Label>Password</Label>
                    <Input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? "Signing in..." : "Sign in"}
                  </Button>
                  <Button type="button" variant="link" className="w-full" onClick={() => setShowRecovery(true)}>
                    <LifeBuoy /> I forgot my Auth ID
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

      <Dialog open={showAuthId} onOpenChange={setShowAuthId}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Your Auth ID is ready</DialogTitle>
            <DialogDescription>Save this six-character code. You will use it instead of your email every time you sign in.</DialogDescription>
          </DialogHeader>
          <div className="rounded-xl border border-primary/30 bg-secondary/50 p-5 text-center">
            <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Auth ID</div>
            <div className="mt-2 text-3xl font-bold tracking-[0.3em] text-primary">{newAuthId}</div>
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={copyAuthId}>{copied ? <Check /> : <Copy />}{copied ? "Copied" : "Copy code"}</Button>
            <Button onClick={() => setShowAuthId(false)}>Continue</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showRecovery} onOpenChange={setShowRecovery}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request your Auth ID</DialogTitle>
            <DialogDescription>Provide details the admin can use to verify your identity and return your six-character code.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleRecovery} className="space-y-4">
            <div className="space-y-2"><Label>Full name</Label><Input required value={recovery.fullName} onChange={(e) => setRecovery({ ...recovery, fullName: e.target.value })} /></div>
            <div className="space-y-2"><Label>Registered email</Label><Input required type="email" value={recovery.registeredEmail} onChange={(e) => setRecovery({ ...recovery, registeredEmail: e.target.value })} /></div>
            <div className="space-y-2"><Label>Department <span className="text-xs text-muted-foreground">(optional)</span></Label><Input value={recovery.department} onChange={(e) => setRecovery({ ...recovery, department: e.target.value })} /></div>
            <div className="space-y-2"><Label>Verification details</Label><Textarea required minLength={10} value={recovery.message} onChange={(e) => setRecovery({ ...recovery, message: e.target.value })} placeholder="For example: your role, supervisor, or recent duty assignment" /></div>
            <DialogFooter className="gap-2 sm:gap-2"><Button type="button" variant="outline" onClick={() => setShowRecovery(false)}><ArrowLeft />Back</Button><Button type="submit" disabled={recoveryLoading}>{recoveryLoading ? "Sending..." : "Send request"}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

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