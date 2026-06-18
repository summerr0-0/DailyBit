import { notFound } from "next/navigation";
import Link from "next/link";
import { getThread } from "@/lib/threads";
import { getTagCloud } from "@/lib/bits";
import { TAG_PATTERN } from "@/lib/tags";
import type { ReactNode } from "react";

type Props = { params: Promise<{ id: string }> };

function renderContent(content: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;

  for (const match of content.matchAll(TAG_PATTERN)) {
    const start = match.index ?? 0;
    const full = match[0];
    const name = match[1];

    if (start > lastIndex) nodes.push(content.slice(lastIndex, start));
    nodes.push(
      <Link
        key={start}
        href={`/tags/${name.toLowerCase()}`}
        style={{ color: "#B05A18", fontWeight: 600 }}
      >
        {full}
      </Link>,
    );
    lastIndex = start + full.length;
  }

  if (lastIndex < content.length) nodes.push(content.slice(lastIndex));
  return nodes;
}

export default async function ThreadPage({ params }: Props) {
  const { id } = await params;
  const [thread, tagCloud] = await Promise.all([getThread(id), getTagCloud()]);

  if (!thread) notFound();

  return (
    <div style={{ minHeight: "100vh", background: "#F4F0E7", padding: "32px 20px 80px" }}>
      <div style={{ maxWidth: "900px", margin: "0 auto" }}>

        {/* Back button */}
        <Link
          href="/"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            fontSize: "13.5px",
            color: "#A89E89",
            textDecoration: "none",
            marginBottom: "22px",
            transition: "color 0.15s",
          }}
          className="hover:!text-[#33302A]"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
          Back to feed
        </Link>

        {/* Content grid */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "1fr 220px",
          gap: "24px",
          alignItems: "start",
        }}>

          {/* Main: thread bits */}
          <div>
            {/* Thread header */}
            <div style={{
              background: "#FFFDF8",
              border: "1px solid #E8E1D2",
              borderRadius: "18px",
              padding: "20px 24px",
              marginBottom: "16px",
            }}>
              <h1 style={{
                fontFamily: "var(--font-newsreader), serif",
                fontSize: "22px",
                fontWeight: 500,
                color: "#2A2620",
                margin: 0,
                letterSpacing: "-0.3px",
                lineHeight: 1.3,
              }}>
                {thread.title}
              </h1>
              <p style={{ fontSize: "13px", color: "#A89E89", marginTop: "6px" }}>
                {thread.bits.length} {thread.bits.length === 1 ? "step" : "steps"}
              </p>
            </div>

            {/* Bit list */}
            <ol style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "0" }}>
              {thread.bits.map((bit, i) => (
                <li key={bit.id} style={{ display: "flex", gap: "16px" }}>
                  {/* Step connector */}
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
                    <div style={{
                      width: "28px",
                      height: "28px",
                      borderRadius: "50%",
                      background: "#FFFDF8",
                      border: "2px solid #C96820",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "11px",
                      fontWeight: 700,
                      color: "#C96820",
                      flexShrink: 0,
                      zIndex: 1,
                    }}>
                      {i + 1}
                    </div>
                    {i < thread.bits.length - 1 && (
                      <div style={{ width: "2px", flex: 1, background: "#E8E1D2", minHeight: "20px" }} />
                    )}
                  </div>

                  {/* Bit card */}
                  <div style={{
                    flex: 1,
                    background: "#FFFDF8",
                    border: "1px solid #E8E1D2",
                    borderRadius: "16px",
                    padding: "16px 18px",
                    marginBottom: i < thread.bits.length - 1 ? "0" : "0",
                    marginTop: "0",
                    position: "relative",
                    top: "0",
                    transform: "translateY(-2px)",
                    marginLeft: "0",
                    marginRight: "0",
                    marginInline: "0",
                    ...(i < thread.bits.length - 1 ? { marginBottom: "12px" } : {}),
                  }}>
                    <p style={{ fontSize: "12.5px", color: "#A89E89", marginBottom: "6px" }}>
                      {new Date(bit.createdAt).toLocaleDateString("ko-KR", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                    </p>
                    <p style={{ fontSize: "15px", lineHeight: 1.68, color: "#33302A", whiteSpace: "pre-wrap", margin: 0 }}>
                      {renderContent(bit.content)}
                    </p>
                    {bit.tags.length > 0 && (
                      <div style={{ marginTop: "10px", display: "flex", flexWrap: "wrap", gap: "6px" }}>
                        {bit.tags.map((tag) => (
                          <Link
                            key={tag}
                            href={`/tags/${tag}`}
                            style={{
                              fontSize: "12px",
                              color: "#B05A18",
                              fontWeight: 600,
                              textDecoration: "none",
                              background: "#FEF3E8",
                              padding: "2px 8px",
                              borderRadius: "999px",
                            }}
                          >
                            #{tag}
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                </li>
              ))}

              {thread.bits.length === 0 && (
                <li style={{
                  background: "#FFFDF8",
                  border: "1px solid #E8E1D2",
                  borderRadius: "16px",
                  padding: "32px",
                  textAlign: "center",
                  fontSize: "14px",
                  color: "#A89E89",
                }}>
                  No entries yet.
                </li>
              )}
            </ol>
          </div>

          {/* Sidebar: categories */}
          <div style={{ position: "sticky", top: "24px" }}>
            <div style={{
              background: "#FFFDF8",
              border: "1px solid #E8E1D2",
              borderRadius: "18px",
              padding: "18px",
              boxShadow: "0 1px 2px rgba(60,50,30,0.04)",
            }}>
              <div style={{ fontSize: "13px", fontWeight: 700, color: "#8A8170", letterSpacing: "0.4px", marginBottom: "13px" }}>
                Tags
              </div>
              {tagCloud.length === 0 ? (
                <p style={{ fontSize: "13px", color: "#C0B9A9" }}>No tags</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
                  {tagCloud.map(({ tag, count }) => (
                    <Link
                      key={tag}
                      href={`/?tags=${tag}`}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: "8px 11px",
                        borderRadius: "10px",
                        fontSize: "14px",
                        fontWeight: 500,
                        color: "#4A4438",
                        textDecoration: "none",
                        transition: "background 0.1s",
                      }}
                      className="hover:bg-[#FEF3E8] hover:!text-[#9C4A1A]"
                    >
                      <span>#{tag}</span>
                      <span style={{ fontSize: "12.5px", color: "#B4AB97" }}>{count}</span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
