import { createFileRoute, useNavigate } from "@tanstack/react-router";
// import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { assignAuthId, resolveAuthId, requestAuthIdRecovery } from "@/lib/auth-id.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Leaf, CalendarCheck, ShieldCheck, Users, Copy, Check, AlertTriangle } from "lucide-react";
import authHero from "@/assets/auth-hero.jpg";

export const Route = createFileRoute("/auth")({
  ssr: false,
  component: AuthPage,
});

function CopyAuthId({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 font-mono text-2xl tracking-[0.3em] text-center py-3 rounded-lg bg-secondary border border-border">
        {code}
      </div>
      <Button type="button" variant="outline" size="icon" onClick={copy} aria-label="Copy Auth ID">
        {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
      </Button>
    </div>
  );
}

function ForgotAuthIdDialog() {
  // const recover = useServerFn(requestAuthIdRecovery);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

 async function submit(e: React.FormEvent) {
   e.preventDefault();
   setLoading(true);
   try {
     await requestAuthIdRecovery(fullName, email, note);
     toast.success("Request sent. Admin will verify and contact you surely.");
     setOpen(false);
   } catch {
     toast.error("Something went wrong. Try again.");
   } finally {
     setLoading(false);
   }
 }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button type="button" className="text-xs text-primary underline underline-offset-2">
          Forgot your Auth ID?
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Recover your Auth ID</DialogTitle>
          <DialogDescription>
            Confirm your full name and account email exactly as registered. An admin will verify and
            reach out.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-2">
            <Label>Full name</Label>
            <Input required value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Account email</Label>
            <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Note (optional)</Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Anything that helps admin confirm it's you"
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={loading}>
              {loading ? "Sending..." : "Send request"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AuthPage() {
  const navigate = useNavigate();
  // const resolveId = useServerFn(resolveAuthId);
  // const assignId = useServerFn(assignAuthId);

  const [loading, setLoading] = useState(false);
  const [identifier, setIdentifier] = useState("");
  const [authId, setAuthId] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [issuedAuthId, setIssuedAuthId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) navigate({ to: "/dashboard" });
    });
  }, [navigate]);

 async function handleSignIn(e: React.FormEvent) {
   e.preventDefault();
   setLoading(true);
   try {
     const trimmed = identifier.trim();
     const isEmail = trimmed.includes("@");

     let targetEmail: string;
     if (isEmail) {
       targetEmail = trimmed;
     } else {
       const { email: resolvedEmail } = await resolveAuthId(trimmed);
       targetEmail = resolvedEmail;
     }

     const { error } = await supabase.auth.signInWithPassword({
       email: targetEmail,
       password,
     });
     if (error) throw new Error("Invalid credentials");

     toast.success("Signed in");
     navigate({ to: "/dashboard" });
   } catch (err: any) {
     toast.error(err.message ?? "Invalid credentials");
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
   if (error) {
     setLoading(false);
     return toast.error(error.message);
   }
   if (data.user && data.session) {
     // session exists immediately only if email confirmation is OFF
     const { authId: newId } = await assignAuthId();
     setIssuedAuthId(newId);
   } else {
     toast.success("Account created. Check your email to confirm, then sign in.");
   }
   setLoading(false);
 }

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-background">
      <div className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-md">
          <div className="flex items-center gap-2.5 mb-8">
            <div className="w-10 h-10 rounded-xl bg-primary text-primary-foreground grid place-items-center shadow-sm">
              <Leaf className="w-5 h-5" />
            </div>
            <div>
              <div className="font-semibold text-foreground leading-tight">
                Leave &amp; Duty Roster
              </div>
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                Staff workspace
              </div>
            </div>
          </div>

          {issuedAuthId ? (
            <Card className="border-primary/40 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-primary" /> Your Auth ID
                </CardTitle>
                <CardDescription>
                  You'll use this — not your email — to sign in from now on.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <CopyAuthId code={issuedAuthId} />
                <div className="flex gap-2 text-xs text-muted-foreground bg-secondary/60 p-3 rounded-lg">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-accent-foreground" />
                  <p>
                    Save this now — screenshot it or write it down. It won't be shown again on this
                    screen. Don't share it with anyone. If you lose it, use "Forgot your Auth ID?"
                    on the sign-in tab and an admin will verify your identity before reissuing it.
                  </p>
                </div>
                <Button className="w-full" onClick={() => setIssuedAuthId(null)}>
                  I've saved it — go to sign in
                </Button>
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="mb-6">
                <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                  Welcome back
                </h1>
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
                          <Input
                            required
                            placeholder=""
                            value={identifier}
                            onChange={(e) => setIdentifier(e.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Password</Label>
                          <Input
                            type="password"
                            required
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                          />
                        </div>
                        <Button type="submit" className="w-full" disabled={loading}>
                          {loading ? "Signing in..." : "Sign in"}
                        </Button>
                        <div className="text-center">
                          <ForgotAuthIdDialog />
                        </div>
                      </form>
                    </TabsContent>
                    <TabsContent value="signup">
                      <form onSubmit={handleSignUp} className="space-y-4 pt-4">
                        <div className="space-y-2">
                          <Label>Full name</Label>
                          <Input
                            required
                            value={fullName}
                            onChange={(e) => setFullName(e.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Email</Label>
                          <Input
                            type="email"
                            required
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Password</Label>
                          <Input
                            type="password"
                            required
                            minLength={6}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                          />
                        </div>
                        <Button type="submit" className="w-full" disabled={loading}>
                          {loading ? "Creating..." : "Create staff account"}
                        </Button>
                        <p className="text-xs text-muted-foreground text-center">
                          You'll be issued a 6-character Auth ID after signup — that's what you use
                          to log in going forward.
                        </p>
                      </form>
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </div>

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
              Staff request time off, supervisors approve in a click, and coverage is assigned
              automatically — with everyone kept in the loop by email.
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

function FeatureRow({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
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
