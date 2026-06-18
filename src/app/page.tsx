import { Suspense } from "react";
import { BitList } from "@/components/bits/BitList";
import { BitComposer } from "@/components/bits/BitComposer";
import { ProfileCard } from "@/components/profile/ProfileCard";
import { TagSidebar } from "@/components/bits/TagSidebar";
import { isLoggedIn } from "@/lib/auth";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ tags?: string }>;
};

export default async function HomePage({ searchParams }: Props) {
  const { tags } = await searchParams;
  const selectedTags = tags ? tags.split(",").filter(Boolean) : [];
  const loggedIn = await isLoggedIn();

  return (
    <div style={{ minHeight: "100vh", background: "#F4F0E7", padding: "40px 20px 80px" }}>
      <div style={{ maxWidth: "1060px", margin: "0 auto" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "baseline", gap: "12px", margin: "0 4px 22px" }}>
          <span style={{ fontFamily: "var(--font-newsreader),serif", fontSize: "30px", fontWeight: 500, letterSpacing: "-0.5px", color: "#2A2620" }}>
            Daily<span style={{ color: "#C96820" }}>bit</span>
          </span>
          <span style={{ fontSize: "14px", color: "#A89E89" }}>one small bit a day</span>
        </div>

        {/* Profile card (full width) */}
        <Suspense fallback={
          <div style={{ background: "#FFFDF8", border: "1px solid #E8E1D2", borderRadius: "20px", height: "280px" }} />
        }>
          <ProfileCard />
        </Suspense>

        {/* Body grid: feed + tag sidebar */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "1fr 252px",
          gap: "22px",
          marginTop: "22px",
          alignItems: "start",
        }}>

          {/* Main feed */}
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {loggedIn && <BitComposer />}

            {selectedTags.length > 0 && (
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                background: "#FEF3E8", border: "1px solid #F4DEC9", borderRadius: "12px", padding: "11px 16px",
              }}>
                <span style={{ fontSize: "13.5px", color: "#9C4A1A" }}>
                  Showing #{selectedTags.join(", #")}
                </span>
                <a
                  href="/"
                  style={{ fontSize: "13px", color: "#9C4A1A", fontWeight: 600, textDecoration: "none" }}
                >
                  Show all ✕
                </a>
              </div>
            )}

            <Suspense fallback={
              <div style={{ color: "#A89E89", fontSize: "14px", textAlign: "center", padding: "32px 0" }}>
                Loading...
              </div>
            }>
              <BitList filterTags={selectedTags} isLoggedIn={loggedIn} />
            </Suspense>
          </div>

          {/* Tag sidebar */}
          <div style={{ position: "sticky", top: "24px" }}>
            <Suspense fallback={
              <div style={{ background: "#FFFDF8", border: "1px solid #E8E1D2", borderRadius: "18px", height: "200px" }} />
            }>
              <TagSidebar selectedTags={selectedTags} />
            </Suspense>
          </div>

        </div>
      </div>
    </div>
  );
}
