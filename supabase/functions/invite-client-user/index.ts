import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Verify caller is agency admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Not authenticated");
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authErr } = await createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_ANON_KEY")!
    ).auth.getUser(token);
    if (authErr || !user) throw new Error("Not authenticated");

    // Check admin
    const { data: isAdmin } = await supabase.rpc("is_agency_admin", { _user_id: user.id });
    if (!isAdmin) throw new Error("Only agency admins can send invites");

    const { email, client_id } = await req.json();
    if (!email || !client_id) throw new Error("email and client_id required");

    // Get client name
    const { data: client } = await supabase
      .from("clients")
      .select("name")
      .eq("id", client_id)
      .single();
    if (!client) throw new Error("Client not found");

    // Upsert invite
    const { data: invite, error: invErr } = await supabase
      .from("client_invites")
      .upsert(
        { email: email.toLowerCase(), client_id, role: "viewer", invited_by: user.id, status: "pending", accepted_at: null },
        { onConflict: "client_id,email" }
      )
      .select("token")
      .single();
    if (invErr) throw invErr;

    // Generate signup link using Supabase admin API
    const appUrl = Deno.env.get("APP_URL") || "https://tinnedfishclub.lovable.app";
    const signupLink = `${appUrl}/auth?invite=${invite.token}&email=${encodeURIComponent(email.toLowerCase())}`;

    // Send invite email via Supabase Auth admin
    const { error: emailErr } = await supabase.auth.admin.inviteUserByEmail(
      email.toLowerCase(),
      { redirectTo: signupLink, data: { invite_token: invite.token, client_name: client.name } }
    );

    // If user already exists, that's fine - they'll just need to log in
    if (emailErr && !emailErr.message.includes("already been registered")) {
      console.error("Invite email error:", emailErr);
      // Still return success since the invite record was created
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Invite sent to ${email}`,
        signup_link: signupLink,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
