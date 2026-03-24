import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useNavigate } from "react-router-dom";
interface CheckResult {
  name: string;
  status: "pending" | "pass" | "fail";
  detail: string;
}
const CHECKS = [
  {
    name: "Database connection",
    run: async () => {
      const { error } = await supabase.from("profiles").select("id").limit(1);
      return { pass: !error, detail: error?.message || "Connected" };
    },
  },
  {
    name: "Professional profiles count",
    run: async () => {
      const { count } = await supabase
        .from("professional_profiles")
        .select("*", { count: "exact", head: true });
      return {
        pass: (count || 0) > 0,
        detail: `${count || 0} professionals — seed if 0`,
      };
    },
  },
  {
    name: "Embeddings populated",
    run: async () => {
      const { data } = await supabase
        .from("professional_profiles")
        .select("embedding")
        .limit(10);
      const total = data?.length || 0;
      const withEmb = (data || []).filter(p => p.embedding !== null).length;
      return {
        pass: withEmb > 0,
        detail: total === 0
          ? "No professionals — seed first"
          : `${withEmb}/${total} have embeddings`,
      };
    },
  },
  {
    name: "generate-embedding function",
    run: async () => {
      try {
        const { data, error } = await supabase.functions.invoke(
          "generate-embedding",
          { body: { text: "test embedding diagnostic" } }
        );
        if (error) throw new Error(error.message);
        const dims = data?.embedding?.length;
        return {
          pass: (dims || 0) > 0,
          detail: dims
            ? `Working via ${data.method}, ${dims} dimensions`
            : `No embedding: ${JSON.stringify(data)}`,
        };
      } catch (e: any) {
        return { pass: false, detail: e.message };
      }
    },
  },
  {
    name: "Opportunities exist",
    run: async () => {
      const { count } = await supabase
        .from("opportunities")
        .select("*", { count: "exact", head: true });
      return {
        pass: (count || 0) > 0,
        detail: `${count || 0} opportunities — post one if 0`,
      };
    },
  },
  {
    name: "match-professionals function",
    run: async () => {
      try {
        const { data: opp } = await supabase
          .from("opportunities")
          .select("id")
          .limit(1)
          .single();
        if (!opp) return {
          pass: false,
          detail: "No opportunities to test — post one first"
        };
        const { data, error } = await supabase.functions.invoke(
          "match-professionals",
          { body: { opportunityId: opp.id } }
        );
        if (error) throw new Error(error.message);
        return {
          pass: true,
          detail: `Found ${data?.matchesFound || 0} matches via ${data?.method || "unknown"}`,
        };
      } catch (e: any) {
        return { pass: false, detail: e.message };
      }
    },
  },
  {
    name: "Matches in database",
    run: async () => {
      const { data, count } = await supabase
        .from("matches")
        .select("similarity_score", { count: "exact" });
      const scores = (data || [])
        .map(m => m.similarity_score)
        .filter(Boolean) as number[];
      const avg = scores.length > 0
        ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(3)
        : "0";
      const roundCount = scores.filter(s =>
        [0.2, 0.4, 0.6, 0.8].includes(Math.round(s * 10) / 10)
      ).length;
      const usingVector = scores.length > 0 && roundCount < scores.length / 2;
      return {
        pass: (count || 0) > 0,
        detail: count === 0
          ? "No matches yet"
          : `${count} matches, avg: ${avg}, engine: ${usingVector ? "vector ✓" : "keyword fallback ⚠"}`,
      };
    },
  },
  {
    name: "RLS policies",
    run: async () => {
      const { error: m } = await supabase.from("matches").select("id").limit(1);
      const { error: o } = await supabase.from("opportunities").select("id").limit(1);
      const ok = !m && !o;
      return {
        pass: ok,
        detail: ok ? "All readable" : `Issues: ${m?.message || ""} ${o?.message || ""}`,
      };
    },
  },
];
export default function AdminDiagnostics() {
  const navigate = useNavigate();
  const [results, setResults] = useState<CheckResult[]>(
    CHECKS.map(c => ({ name: c.name, status: "pending", detail: "" }))
  );
  const [running, setRunning] = useState(false);
  const runAll = async () => {
    setRunning(true);
    setResults(CHECKS.map(c => ({ name: c.name, status: "pending", detail: "" })));
    for (let i = 0; i < CHECKS.length; i++) {
      try {
        const r = await CHECKS[i].run();
        setResults(prev => {
          const next = [...prev];
          next[i] = { name: CHECKS[i].name, status: r.pass ? "pass" : "fail", detail: r.detail };
          return next;
        });
      } catch (e: any) {
        setResults(prev => {
          const next = [...prev];
          next[i] = { name: CHECKS[i].name, status: "fail", detail: e.message };
          return next;
        });
      }
      await new Promise(r => setTimeout(r, 400));
    }
    setRunning(false);
  };
  const copyReport = () => {
    const passing = results.filter(r => r.status === "pass").length;
    const lines = [
      "MATCHED PLATFORM DIAGNOSTIC REPORT",
      `Date: ${new Date().toISOString()}`,
      "─".repeat(50),
      ...results.map(r =>
        `[${r.status.toUpperCase()}] ${r.name}: ${r.detail}`
      ),
      "─".repeat(50),
      `${passing}/${results.length} checks passing`,
    ];
    navigator.clipboard.writeText(lines.join("\n"));
    alert("Report copied to clipboard");
  };
  const passing = results.filter(r => r.status === "pass").length;
  const failing = results.filter(r => r.status === "fail").length;
  return (
    <div style={{
      minHeight: "100vh", background: "#0C0C0C",
      color: "#fff", padding: "48px 24px",
      fontFamily: "DM Sans, sans-serif"
    }}>
      <div style={{ maxWidth: "600px", margin: "0 auto" }}>
        <button
          onClick={() => navigate("/admin/seed")}
          style={{ color: "#666", fontSize: "14px",
            background: "none", border: "none",
            cursor: "pointer", marginBottom: "24px" }}
        >
          ← Back to seed
        </button>
        <h1 style={{ fontSize: "28px", fontWeight: 700,
          letterSpacing: "-0.04em", marginBottom: "8px" }}>
          Diagnostics
        </h1>
        <p style={{ color: "#666", fontSize: "14px", marginBottom: "32px" }}>
          Run checks on every system component.
        </p>
        <div style={{ display: "flex", gap: "12px", marginBottom: "32px" }}>
          <button
            onClick={runAll}
            disabled={running}
            style={{
              padding: "10px 24px", borderRadius: "100px",
              background: running ? "#333" : "#E8FF47",
              color: running ? "#666" : "#000",
              border: "none", fontWeight: 600,
              fontSize: "14px", cursor: running ? "not-allowed" : "pointer",
            }}
          >
            {running ? "Running..." : "Run all checks"}
          </button>
          <button
            onClick={copyReport}
            style={{
              padding: "10px 24px", borderRadius: "100px",
              background: "transparent", color: "#666",
              border: "1px solid #2a2a2a", fontSize: "14px",
              cursor: "pointer",
            }}
          >
            Copy report
          </button>
        </div>
        {!running && failing > 0 && (
          <div style={{
            padding: "16px", borderRadius: "12px", marginBottom: "24px",
            background: "rgba(255,68,68,0.08)",
            border: "1px solid rgba(255,68,68,0.2)",
            color: "#ff6666", fontSize: "14px",
          }}>
            {failing} check{failing > 1 ? "s" : ""} failing.
            Copy the report and share it for help.
          </div>
        )}
        {!running && passing === CHECKS.length && passing > 0 && (
          <div style={{
            padding: "16px", borderRadius: "12px", marginBottom: "24px",
            background: "rgba(168,255,62,0.08)",
            border: "1px solid rgba(168,255,62,0.2)",
            color: "#A8FF3E", fontSize: "14px",
          }}>
            All {passing} checks passing — platform is healthy ✓
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {results.map(r => (
            <div
              key={r.name}
              style={{
                display: "flex", alignItems: "flex-start", gap: "16px",
                padding: "16px", borderRadius: "12px",
                background: "#111", border: "1px solid #1e1e1e",
              }}
            >
              <div style={{ fontSize: "18px", marginTop: "2px", flexShrink: 0 }}>
                {r.status === "pending" && <span style={{ color: "#444" }}>○</span>}
                {r.status === "pass" && <span style={{ color: "#A8FF3E" }}>✓</span>}
                {r.status === "fail" && <span style={{ color: "#ff4444" }}>✗</span>}
              </div>
              <div>
                <p style={{ fontSize: "14px", fontWeight: 500,
                  color: "#fff", margin: 0 }}>
                  {r.name}
                </p>
                {r.detail && (
                  <p style={{ fontSize: "12px", color: "#555",
                    margin: "4px 0 0", wordBreak: "break-word" }}>
                    {r.detail}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
        <p style={{ color: "#333", fontSize: "12px",
          textAlign: "center", marginTop: "32px" }}>
          {passing}/{CHECKS.length} passing
        </p>
      </div>
    </div>
  );
}
