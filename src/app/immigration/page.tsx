import Link from "next/link";
import { notFound } from "next/navigation";
import { isLoggedIn } from "@/lib/auth";
import { getRecentDraws, getSnapshots, type DrawRow } from "@/lib/immigration/store";
import { SOURCES, isTechRelevant, type Program } from "@/lib/immigration/sources";

// 캐나다 영주권 선발 기록 — 오너 전용 (spec: immigration-monitor R4). 방문자는 404.
export const dynamic = "force-dynamic";

const PROGRAMS: { id: Program; label: string }[] = [
  { id: "AAIP", label: "Alberta AAIP" },
  { id: "BC_PNP", label: "BC PNP" },
  { id: "EE", label: "Express Entry" },
];

type Props = { searchParams: Promise<{ tech?: string }> };

export default async function ImmigrationPage({ searchParams }: Props) {
  if (!(await isLoggedIn())) notFound();
  const techOnly = (await searchParams).tech === "1";

  const [sections, snapshots] = await Promise.all([
    Promise.all(PROGRAMS.map(async (p) => ({ ...p, rows: await getRecentDraws(p.id, techOnly ? 200 : 40) }))),
    getSnapshots(),
  ]);

  return (
    <div className="db-page">
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <header style={{ marginBottom: 18 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "#3C3220" }}>Canada PR draws</h1>
          <p style={{ marginTop: 6, fontSize: 13.5, color: "#A89E89" }}>
            Private. Read once a day from the official pages — always check the source before deciding. ★ = may fit a developer (NOC 2123x).
          </p>
          <nav style={{ display: "flex", gap: 8, marginTop: 12 }} aria-label="Filter">
            <FilterLink href="/immigration" active={!techOnly}>All draws</FilterLink>
            <FilterLink href="/immigration?tech=1" active={techOnly}>★ only</FilterLink>
          </nav>
        </header>

        {sections.map((s) => {
          const rows = techOnly ? s.rows.filter(isTechRelevant).slice(0, 40) : s.rows;
          return (
            <section key={s.id} aria-label={s.label} style={{ background: "#FFFDF8", border: "1px solid #E8E1D2", borderRadius: 18, padding: "16px 18px", marginBottom: 16 }}>
              <h2 style={{ fontSize: 15, fontWeight: 700, color: "#3C3220", display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                {s.label}
                <a href={SOURCES[s.id]} target="_blank" rel="noreferrer" style={{ fontSize: 12, fontWeight: 500, color: "#B07A4A" }}>
                  Official source ↗
                </a>
              </h2>
              {rows.length === 0 ? (
                <p style={{ fontSize: 13, color: "#B4AB97", marginTop: 8 }}>No draws stored yet.</p>
              ) : (
                <div style={{ overflowX: "auto", marginTop: 8 }}>
                  <DrawTable rows={rows} />
                </div>
              )}
            </section>
          );
        })}

        {snapshots.length > 0 && (
          <p style={{ fontSize: 12, color: "#B4AB97" }}>
            {snapshots.map((s) => `${new URL(s.url).pathname} — checked ${s.checkedAt.toISOString().slice(0, 10)}, last changed ${s.changedAt.toISOString().slice(0, 10)}`).join(" · ")}
          </p>
        )}
      </div>
    </div>
  );
}

function DrawTable({ rows }: { rows: DrawRow[] }) {
  const cell = { padding: "6px 8px", borderBottom: "1px solid #F0EADF", verticalAlign: "top" } as const;
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, color: "#3C3220", minWidth: 480 }}>
      <thead>
        <tr style={{ textAlign: "left", color: "#A89E89", fontSize: 12 }}>
          <th style={cell}>Date</th>
          <th style={cell}>Stream</th>
          <th style={{ ...cell, textAlign: "right" }}>Min score</th>
          <th style={{ ...cell, textAlign: "right" }}>Invites</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const tech = isTechRelevant(r);
          return (
            <tr key={r.id} style={{ fontWeight: tech ? 600 : 400 }}>
              <td style={{ ...cell, whiteSpace: "nowrap" }}>{r.drawDate}</td>
              <td style={cell}>
                {tech ? "★ " : ""}
                {r.stream}
                {r.detail && r.program === "BC_PNP" && <div style={{ fontSize: 12, fontWeight: 400, color: "#A89E89" }}>{r.detail}</div>}
              </td>
              <td style={{ ...cell, textAlign: "right" }}>{r.minScore ?? "—"}</td>
              <td style={{ ...cell, textAlign: "right" }}>{r.invitationsText || "—"}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function FilterLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      style={{
        fontSize: 12.5,
        padding: "4px 10px",
        borderRadius: 999,
        border: "1px solid #E0D6C4",
        background: active ? "#FBEBDD" : "transparent",
        color: "#3C3220",
        textDecoration: "none",
      }}
    >
      {children}
    </Link>
  );
}
