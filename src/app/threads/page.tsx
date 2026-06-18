import Link from "next/link";
import { getThreads } from "@/lib/threads";
import { getTagCloud } from "@/lib/bits";

export const dynamic = "force-dynamic";

export default async function ThreadsPage() {
  const [threads, tagCloud] = await Promise.all([getThreads(), getTagCloud()]);

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

          {/* Thread list */}
          <div>
            <div style={{
              background: "#FFFDF8", border: "1px solid #E8E1D2",
              borderRadius: "18px", padding: "18px 22px", marginBottom: "16px",
            }}>
              <h1 style={{ fontSize: "20px", fontWeight: 700, color: "#2A2620", margin: 0 }}>
                Threads
              </h1>
              <p style={{ fontSize: "13px", color: "#A89E89", marginTop: "4px" }}>
                {threads.length} {threads.length === 1 ? "thread" : "threads"}
              </p>
            </div>

            {threads.length === 0 ? (
              <div style={{ textAlign: "center", color: "#A89E89", fontSize: "14px", padding: "48px 0" }}>
                No threads yet.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                {threads.map((thread) => (
                  <Link
                    key={thread.id}
                    href={`/threads/${thread.id}`}
                    style={{ textDecoration: "none" }}
                  >
                    <article style={{
                      background: "#FFFDF8", border: "1px solid #E8E1D2",
                      borderRadius: "18px", padding: "18px 20px",
                      boxShadow: "0 1px 2px rgba(60,50,30,0.03)",
                      transition: "border-color 0.15s, box-shadow 0.15s",
                    }}
                      className="hover:[border-color:#E8C9A5] hover:[box-shadow:0_4px_16px_rgba(60,50,30,0.07)]"
                    >
                      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px" }}>
                        <div>
                          <h2 style={{ fontSize: "15.5px", fontWeight: 600, color: "#2A2620", margin: 0, lineHeight: 1.4 }}>
                            {thread.title}
                          </h2>
                          <p style={{ fontSize: "13px", color: "#A89E89", marginTop: "6px" }}>
                            {thread.bitCount} {thread.bitCount === 1 ? "step" : "steps"}
                          </p>
                        </div>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#C0B9A9" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: "3px" }}>
                          <polyline points="9 18 15 12 9 6"/>
                        </svg>
                      </div>
                    </article>
                  </Link>
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
                {tagCloud.map(({ tag, count }) => (
                  <Link
                    key={tag}
                    href={`/tags/${tag}`}
                    style={{
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                      padding: "8px 11px", borderRadius: "10px", fontSize: "14px",
                      fontWeight: 500, color: "#4A4438", textDecoration: "none",
                    }}
                    className="hover:bg-[#FEF3E8] hover:!text-[#9C4A1A]"
                  >
                    <span>#{tag}</span>
                    <span style={{ fontSize: "12.5px", color: "#B4AB97" }}>{count}</span>
                  </Link>
                ))}
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
