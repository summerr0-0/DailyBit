import { notFound } from "next/navigation";
import Link from "next/link";
import { getThread } from "@/lib/threads";
import { getTagCloud } from "@/lib/bits";
import { isLoggedIn } from "@/lib/auth";
import { getBacklinks, getLinkTargets } from "@/lib/link-targets";
import { pickLinks } from "@/lib/wiki-links";
import { EditableBitContent, ThreadTitle } from "@/components/threads/ThreadEditors";

type Props = { params: Promise<{ id: string }> };

export default async function ThreadPage({ params }: Props) {
  const { id } = await params;
  const owner = await isLoggedIn();
  // 홈 사이드바와 같은 기준: 관리자면 비공개 글의 태그도 센다
  const [thread, tagCloud, links] = await Promise.all([getThread(id, owner), getTagCloud(owner), getLinkTargets(owner)]);

  if (!thread) notFound();
  const backlinks = await getBacklinks(thread.id, owner);
  // 클라이언트 컴포넌트로는 이 페이지 본문이 실제로 가리키는 링크만 넘긴다 (Gemini wiki #1)
  const pageLinks = pickLinks(links, thread.bits.map((b) => b.content));

  return (
    <div className="db-page">
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
        <div className="db-grid">

          {/* Main: thread bits */}
          <div style={{ minWidth: 0 }}>
            {/* Thread header */}
            <div style={{
              background: "#FFFDF8",
              border: "1px solid #E8E1D2",
              borderRadius: "18px",
              padding: "20px 24px",
              marginBottom: "16px",
            }}>
              <ThreadTitle threadId={thread.id} title={thread.title} editable={owner} />
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
                    minWidth: 0,
                    overflowWrap: "anywhere",
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
                    <EditableBitContent bitId={bit.id} content={bit.content} editable={owner} links={pageLinks} />
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

            {/* 백링크: 이 Thread를 [[ ]]로 가리키는 글 (spec wiki-links D4) */}
            {backlinks.length > 0 && (
              <section aria-labelledby="backlinks-heading" style={{ marginTop: "28px", background: "#FFFDF8", border: "1px solid #E8E1D2", borderRadius: "16px", padding: "16px 18px" }}>
                <h2 id="backlinks-heading" style={{ fontSize: "13px", fontWeight: 700, color: "#8A8170", letterSpacing: "0.4px", margin: "0 0 10px" }}>
                  Linked from ({backlinks.length})
                </h2>
                <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "10px" }}>
                  {backlinks.map((b) => (
                    <li key={b.bitId}>
                      {b.threadId ? (
                        <Link href={`/threads/${b.threadId}`} style={{ fontSize: "14px", fontWeight: 600, color: "#B05A18", textDecoration: "none" }}>
                          {b.title}
                        </Link>
                      ) : (
                        <span style={{ fontSize: "14px", fontWeight: 600, color: "#33302A" }}>{b.title}</span>
                      )}
                      <p style={{ fontSize: "12.5px", color: "#A89E89", margin: "2px 0 0" }}>{b.snippet}</p>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>

          {/* Sidebar: categories */}
          <div className="db-side">
            <div className="db-tag-card" role="navigation" aria-label="Tags" style={{
              background: "#FFFDF8",
              border: "1px solid #E8E1D2",
              borderRadius: "18px",
              padding: "18px",
              boxShadow: "0 1px 2px rgba(60,50,30,0.04)",
            }}>
              <div className="db-tag-card-title" style={{ fontSize: "13px", fontWeight: 700, color: "#8A8170", letterSpacing: "0.4px", marginBottom: "13px" }}>
                Tags
              </div>
              {tagCloud.length === 0 ? (
                <p style={{ fontSize: "13px", color: "#C0B9A9" }}>No tags</p>
              ) : (
                <div className="db-tag-list">
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
