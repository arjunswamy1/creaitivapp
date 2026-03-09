import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

const NotionRedirect = () => {
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("");
  const [workspace, setWorkspace] = useState("");

  useEffect(() => {
    const code = searchParams.get("code");
    const error = searchParams.get("error");
    const state = searchParams.get("state");

    if (error) {
      setStatus("error");
      setMessage(error);
      return;
    }

    if (!code || !state) {
      setStatus("error");
      setMessage("Missing code or state parameter");
      return;
    }

    // Send code to edge function for token exchange
    fetch(`${SUPABASE_URL}/functions/v1/notion-oauth-redirect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, state }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          setStatus("error");
          setMessage(data.error);
        } else {
          setStatus("success");
          setWorkspace(data.workspace || "Unknown");
        }
      })
      .catch((err) => {
        setStatus("error");
        setMessage(err.message);
      });
  }, [searchParams]);

  return (
    <div
      style={{
        margin: 0,
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, #667eea, #764ba2)",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 16,
          padding: 48,
          textAlign: "center",
          maxWidth: 400,
          boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
        }}
      >
        {status === "loading" && (
          <>
            <div style={{ fontSize: 48, marginBottom: 16 }}>⏳</div>
            <h1 style={{ margin: "0 0 8px", color: "#1a1a2e" }}>Connecting...</h1>
            <p style={{ color: "#666" }}>Exchanging token with Notion...</p>
          </>
        )}
        {status === "success" && (
          <>
            <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
            <h1 style={{ margin: "0 0 8px", color: "#1a1a2e" }}>Connected!</h1>
            <p style={{ color: "#666", margin: "0 0 16px" }}>
              Workspace: <strong>{workspace}</strong>
            </p>
            <p style={{ color: "#999", fontSize: 14 }}>You can close this window now.</p>
          </>
        )}
        {status === "error" && (
          <>
            <div style={{ fontSize: 48, marginBottom: 16 }}>❌</div>
            <h1 style={{ margin: "0 0 8px", color: "#1a1a2e" }}>Connection Failed</h1>
            <p style={{ color: "#e74c3c" }}>{message}</p>
            <p style={{ color: "#999", fontSize: 14 }}>Please close this window and try again.</p>
          </>
        )}
      </div>
    </div>
  );
};

export default NotionRedirect;
