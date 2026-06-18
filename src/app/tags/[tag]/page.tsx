import Link from "next/link";
import { notFound } from "next/navigation";
import { getBitsByTag, getTagCloud } from "@/lib/bits";
import { isLoggedIn } from "@/lib/auth";
import { isPrivateTag } from "@/lib/privateTags";
import { BitCard } from "@/components/bits/BitCard";
import { BitActionsMenu } from "@/components/bits/BitActionsMenu";

export const dynamic = "force-dynamic";

export default async function TagPage({
  params,
}: {
  params: Promise<{ tag: string }>;
}) {
  const { tag } = await params;
  const normalized = tag.toLowerCase();

  const loggedIn = await isLoggedIn();

  // Gate private tags — unauthenticated visitors get 404
  const privateTag = await isPrivateTag(normalized);
  if (privateTag && !loggedIn) notFound();

  const [bits, tagCloud] = await Promise.all([
    getBitsByTag(normalized, loggedIn),
    getTagCloud(loggedIn),
  ]);

  return (
    <div style={{ minHeight: "100vh", background: "#F4F0E7", padding: "32px 20px 80px" }}>
      <div style={{ maxWidth: "900px", margin: "0 auto" }}>

        {/* Back */}
        <Link
          href="/"
          style={{
            display: "inline-flex", alignItems: "center", gap: "6px",
            fontSize: "13.5px", color: "#A89E89", textDecoration: "none",
            marginBottom: "22px", transition: "color 0.15s",
          }}
          className="hover:!text-[#33302A]"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
          Back to feed
        </Link>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 220px", gap: "24px", alignItems: "start" }}>

          {/* Main */}
          <div>
            <div style={{
              background: "#FFFDF8", border: "1px solid #E8E1D2",
              borderRadius: "18px", padding: "18px 22px", marginBottom: "16px",
            }}>
              <h1 style={{ fontSize: "20px", fontWeight: 700, color: "#2A2620", margin: 0 }}>
                #{normalized}
              </h1>
              <p style={{ fontSize: "13px", color: "#A89E89", marginTop: "4px" }}>
                {bits.length} {bits.length === 1 ? "bit" : "bits"}
              </p>
            </div>

            {bits.length === 0 ? (
              <div style={{ textAlign: "center", color: "#A89E89", fontSize: "14px", padding: "48px 0" }}>
                No bits tagged #{normalized}.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                {bits.map((bit) => (
                  <div key={bit.id} style={{ position: "relative" }}>
                    <BitCard bit={bit} isLoggedIn={loggedIn} />
                    {loggedIn && (
                      <div style={{ position: "absolute", right: "12px", top: "12px" }}>
                        <BitActionsMenu bitId={bit.id} pinned={bit.pinned} isPrivate={bit.private} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Tag sidebar */}
          <div style={{ position: "sticky", top: "24px" }}>
            <div style={{
              background: "#FFFDF8", border: "1px solid #E8E1D2",
              borderRadius: "18px", padding: "18px",
              boxShadow: "0 1px 2px rgba(60,50,30,0.04)",
            }}>
              <div style={{ fontSize: "13px", fontWeight: 700, color: "#8A8170", letterSpacing: "0.4px", marginBottom: "13px" }}>
                Tags
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
                <Link
                  href="/"
                  style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "8px 11px", borderRadius: "10px", fontSize: "14px",
                    fontWeight: 500, color: "#4A4438", textDecoration: "none",
                  }}
                  className="hover:bg-[#FEF3E8] hover:!text-[#9C4A1A]"
                >
                  <span>All</span>
                </Link>
                {tagCloud.map(({ tag: t, count, isPrivateTag: priv }) => {
                  const active = t === normalized;
                  return (
                    <Link
                      key={t}
                      href={`/tags/${t}`}
                      style={{
                        display: "flex", justifyContent: "space-between", alignItems: "center",
                        padding: "8px 11px", borderRadius: "10px", fontSize: "14px",
                        fontWeight: active ? 700 : 500,
                        color: active ? "#fff" : priv ? "#9C6A2A" : "#4A4438",
                        background: active ? "#C96820" : "transparent",
                        textDecoration: "none",
                      }}
                      className={active ? "" : "hover:bg-[#FEF3E8] hover:!text-[#9C4A1A]"}
                    >
                      <span style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                        {priv && (
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/>
                          </svg>
                        )}
                        #{t}
                      </span>
                      <span style={{ fontSize: "12.5px", color: active ? "#F5D5B0" : "#B4AB97" }}>{count}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
