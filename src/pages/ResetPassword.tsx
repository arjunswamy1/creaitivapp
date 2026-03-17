import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { ArrowRight, Loader2, CheckCircle2 } from "lucide-react";
import creaitvLogo from "@/assets/creaitiv-logo.png";

const ResetPassword = () => {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [isRecovery, setIsRecovery] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    // Listen for the PASSWORD_RECOVERY event
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setIsRecovery(true);
      }
    });

    // Check hash for recovery type
    const hash = window.location.hash;
    if (hash.includes("type=recovery")) {
      setIsRecovery(true);
    }

    return () => subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      toast({ title: "Passwords don't match", variant: "destructive" });
      return;
    }
    if (password.length < 6) {
      toast({ title: "Password must be at least 6 characters", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setSuccess(true);
      toast({ title: "Password updated", description: "You can now sign in with your new password." });
      setTimeout(() => navigate("/"), 2000);
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ background: "linear-gradient(135deg, hsl(230,40%,14%), hsl(230,35%,10%))" }}
    >
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center gap-3 mb-10">
          <img src={creaitvLogo} alt="Creaitiv App" className="h-16 w-auto rounded-xl" />
        </div>

        <div
          className="p-8 rounded-xl border"
          style={{ background: "hsl(230,35%,20%)", borderColor: "hsl(230,20%,28%)" }}
        >
          {success ? (
            <div className="flex flex-col items-center gap-3 py-4">
              <CheckCircle2 className="w-10 h-10" style={{ color: "hsl(15,78%,55%)" }} />
              <h2 className="text-lg font-semibold" style={{ color: "hsl(0,0%,98%)" }}>
                Password updated!
              </h2>
              <p className="text-sm text-center" style={{ color: "hsl(230,10%,60%)" }}>
                Redirecting you to the dashboard…
              </p>
            </div>
          ) : (
            <>
              <h2 className="text-lg font-semibold mb-1" style={{ color: "hsl(0,0%,98%)", fontFamily: "Inter, sans-serif" }}>
                Set new password
              </h2>
              <p className="text-sm mb-6" style={{ color: "hsl(230,10%,60%)" }}>
                Enter your new password below.
              </p>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="password" style={{ color: "hsl(0,0%,85%)" }}>New Password</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                    className="border-[hsl(230,20%,28%)] bg-[hsl(230,30%,16%)] text-white placeholder:text-[hsl(230,10%,45%)]"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword" style={{ color: "hsl(0,0%,85%)" }}>Confirm Password</Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    minLength={6}
                    className="border-[hsl(230,20%,28%)] bg-[hsl(230,30%,16%)] text-white placeholder:text-[hsl(230,10%,45%)]"
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full gap-2 text-white font-semibold"
                  style={{ background: "hsl(15,78%,55%)" }}
                  disabled={loading}
                >
                  {loading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      Update password
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </Button>
              </form>
            </>
          )}
        </div>

        <p className="text-xs text-center mt-6" style={{ color: "hsl(230,10%,40%)" }}>
          Powered by Creaitiv App
        </p>
      </div>
    </div>
  );
};

export default ResetPassword;
