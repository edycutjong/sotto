"use client";

import { useState } from "react";

type Result = {
  valid_proof: boolean;
  tampered_proof: boolean;
  verifier: string;
  explorer: string;
} | null;

export default function VerifyOnchainPanel() {
  const [loading, setLoading] = useState(false);
  const [res, setRes] = useState<Result>(null);
  const [err, setErr] = useState("");

  const run = async () => {
    setLoading(true);
    setErr("");
    setRes(null);
    try {
      const r = await fetch("/api/verify-onchain");
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "verification failed");
      setRes(d);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-7xl w-full mx-auto px-6 mb-4">
      <div className="border border-violet-500/30 bg-violet-500/5 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex-1">
          <p className="font-mono text-xs text-violet-300 font-bold uppercase tracking-wider mb-1">
            Real on-chain ZK — no wallet needed
          </p>
          <p className="text-slate-400 text-sm">
            Re-verify a real BN254 Groth16 auction proof against the deployed
            Soroban verifier, live on Testnet.
          </p>
        </div>
        <button
          onClick={run}
          disabled={loading}
          className="text-xs font-semibold px-4 py-2.5 rounded-lg border border-violet-500/40 bg-violet-500/10 text-violet-300 hover:bg-violet-500/20 transition-all cursor-pointer disabled:opacity-50 whitespace-nowrap"
        >
          {loading ? "VERIFYING ON-CHAIN…" : "🔬 VERIFY A REAL PROOF ON-CHAIN"}
        </button>
      </div>

      {res && (
        <div className="mt-2 border border-slate-800 bg-slate-900/50 rounded-xl p-4 font-mono text-xs text-slate-400 space-y-1">
          <p>
            <span className="text-slate-500">real proof → verify_proof = </span>
            <span
              className={res.valid_proof ? "text-emerald-400" : "text-red-400"}
            >
              {String(res.valid_proof)}
            </span>
          </p>
          <p>
            <span className="text-slate-500">
              tampered inputs → verify_proof ={" "}
            </span>
            <span
              className={
                res.tampered_proof ? "text-red-400" : "text-emerald-400"
              }
            >
              {String(res.tampered_proof)}
            </span>
          </p>
          <a
            href={res.explorer}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block mt-1 text-violet-400 hover:text-violet-300"
          >
            View verifier {res.verifier.slice(0, 6)}…{res.verifier.slice(-4)} on
            stellar.expert →
          </a>
        </div>
      )}
      {err && (
        <p className="mt-2 font-mono text-xs text-red-400">Error: {err}</p>
      )}
    </div>
  );
}
