import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { ArrowRight, Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";
import creaitvLogo from "@/assets/creaitiv-logo.png";

const Auth = () => {
  const [searchParams] = useSearchParams();
  const inviteEmail = searchParams.get("email") || "";
  const inviteToken = searchParams.get("invite");

  const [isLogin, setIsLogin] = useState(!inviteToken);
  const [email, setEmail] = useState(inviteEmail);
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [forgotMode, setForgotMode] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { session, loading: authLoading } = useAuth();

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[hsl(230,40%,16%)] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[hsl(15,78%,55%)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (session) {
    return <Navigate to="/" replace />;
  }



  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      toast({ title: "Enter your email", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      toast({ title: "Check your email", description: "We sent you a password reset link." });
      setForgotMode(false);
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate("/");
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        toast({
          title: "Check your email",
          description: "We sent you a confirmation link to verify your account.",
        });
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4"
      style={{ background: "linear-gradient(135deg, hsl(230,40%,14%), hsl(230,35%,10%))" }}
    >
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center gap-3 mb-10">
          <img src={creaitvLogo} alt="Creaitiv App" className="h-16 w-auto rounded-xl" />
          <p className="text-sm font-medium" style={{ color: "hsl(230,10%,60%)", fontFamily: "Inter, sans-serif" }}>
            Performance Dashboard
          </p>
        </div>

        {/* Card */}
        <div className="p-8 rounded-xl border"
          style={{
            background: "hsl(230,35%,20%)",
            borderColor: "hsl(230,20%,28%)",
          }}
        >
          <h2 className="text-lg font-semibold mb-1" style={{ color: "hsl(0,0%,98%)", fontFamily: "Inter, sans-serif" }}>
            {forgotMode ? "Reset password" : isLogin ? "Welcome back" : "Create account"}
          </h2>
          <p className="text-sm mb-6" style={{ color: "hsl(230,10%,60%)" }}>
            {forgotMode
              ? "Enter your email and we'll send you a reset link"
              : inviteToken
                ? "Create an account to access your dashboard"
                : isLogin
                  ? "Sign in to view your performance data"
                  : "Get access to your marketing dashboard"}
          </p>

          <form onSubmit={forgotMode ? handleForgotPassword : handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email" style={{ color: "hsl(0,0%,85%)" }}>Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="border-[hsl(230,20%,28%)] bg-[hsl(230,30%,16%)] text-white placeholder:text-[hsl(230,10%,45%)]"
              />
            </div>
            {!forgotMode && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password" style={{ color: "hsl(0,0%,85%)" }}>Password</Label>
                  {isLogin && (
                    <button
                      type="button"
                      onClick={() => setForgotMode(true)}
                      className="text-xs hover:underline"
                      style={{ color: "hsl(15,78%,55%)" }}
                    >
                      Forgot password?
                    </button>
                  )}
                </div>
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
            )}
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
                  {forgotMode ? "Send reset link" : isLogin ? "Sign in" : "Create account"}
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </Button>
          </form>

          {forgotMode && (
            <p className="text-sm text-center mt-6" style={{ color: "hsl(230,10%,60%)" }}>
              <button
                onClick={() => setForgotMode(false)}
                className="hover:underline font-medium"
                style={{ color: "hsl(15,78%,55%)" }}
              >
                Back to sign in
              </button>
            </p>
          )}

          <p className="text-sm text-center mt-6" style={{ color: "hsl(230,10%,60%)" }}>
            {isLogin ? "Don't have an account?" : "Already have an account?"}{" "}
            <button
              onClick={() => setIsLogin(!isLogin)}
              className="hover:underline font-medium"
              style={{ color: "hsl(15,78%,55%)" }}
            >
              {isLogin ? "Sign up" : "Sign in"}
            </button>
          </p>
        </div>

        <p className="text-xs text-center mt-6" style={{ color: "hsl(230,10%,40%)" }}>
          Powered by Creaitiv App
        </p>
      </div>
    </div>
  );
};

export default Auth;
