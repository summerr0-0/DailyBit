import { isLoggedIn } from "@/lib/auth";
import { getDrafts } from "@/lib/scrap-drafts";
import { ScrapWorkbench } from "@/components/scrap/ScrapWorkbench";

// 테크 글 스크랩 페이지 — 오너(Irin) 전용. 방문자에게는 draft가 노출되지 않는다(R3.3, R5.1).
export default async function ScrapPage() {
  const owner = await isLoggedIn();

  if (!owner) {
    return (
      <div style={{ maxWidth: 640, margin: "0 auto", padding: "40px 20px" }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: "#3C3220" }}>Scrap</h1>
        <p style={{ marginTop: 12, fontSize: 14, color: "#B4AB97" }}>
          This workspace is for the blog owner only. Please log in to use it.
        </p>
      </div>
    );
  }

  const drafts = await getDrafts();

  return (
    <div style={{ maxWidth: 680, margin: "0 auto", padding: "28px 20px 80px" }}>
      <header style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: "#3C3220" }}>Scrap</h1>
        <p style={{ marginTop: 6, fontSize: 13.5, color: "#B4AB97" }}>
          Paste a URL (or the raw text) and let AI draft a Bit or Thread. Nothing is published until you confirm.
        </p>
      </header>
      <ScrapWorkbench initialDrafts={drafts} />
    </div>
  );
}
