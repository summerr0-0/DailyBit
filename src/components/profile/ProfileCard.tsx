import { getGarden, getStats } from "@/lib/garden";
import type { GardenLevel } from "@/lib/garden";

const JANDI: Record<GardenLevel, string> = {
  0: "#EBE5D6",
  1: "#F5D5B0",
  2: "#E8A56A",
  3: "#C96820",
  4: "#9C4A1A",
};

const MONTHS = [
  "Jan","Feb","Mar","Apr","May","Jun",
  "Jul","Aug","Sep","Oct","Nov","Dec",
];

const DAY_LABELS = ["", "Mon", "", "Wed", "", "Fri", ""];

const LINKS = [
  { label: "GitHub",   href: "https://github.com/summerr0-0" },
  { label: "LinkedIn", href: "https://www.linkedin.com/in/irin-jeong/" },
  { label: "Email",    href: "mailto:irin.jeong.dev@gmail.com" },
  { label: "Resume",   href: "/Irin_resume.pdf" },
];

const BIO =
  "Product-driven Full-stack Developer with 5 years of experience in Java and Spring Boot. " +
  "I take ownership of the entire product lifecycle — from initial concept to deployment, " +
  "specialized in modernizing PIMS and building robust backend architectures.";

function monthLabelsForWeeks(
  weeks: { date: string; inRange: boolean }[][],
): string[] {
  let prev = -1;
  return weeks.map((week) => {
    const ref = week.find((d) => d.inRange) ?? week[0];
    const m = new Date(ref.date + "T00:00:00Z").getUTCMonth();
    if (m !== prev) { prev = m; return MONTHS[m]; }
    return "";
  });
}

export async function ProfileCard() {
  const [garden, stats] = await Promise.all([getGarden(), getStats()]);
  const monthLabels = monthLabelsForWeeks(garden.weeks);

  return (
    <div style={{
      background: "#FFFDF8",
      border: "1px solid #E8E1D2",
      borderRadius: "20px",
      padding: "30px 32px",
      boxShadow: "0 1px 2px rgba(60,50,30,0.04)",
    }}>
      {/* ── Identity row ── */}
      <div style={{ display: "flex", gap: "22px", alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{
          width: "72px", height: "72px", borderRadius: "50%",
          background: "#F4F0E7",
          display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0, overflow: "hidden",
          boxShadow: "0 4px 14px rgba(201,104,32,0.18)",
          border: "2px solid #E8E1D2",
        }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/avatar.png" alt="Irin" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        </div>

        <div style={{ flex: 1, minWidth: "260px" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: "10px", flexWrap: "wrap" }}>
            <span style={{ fontSize: "21px", fontWeight: 700, letterSpacing: "-0.3px" }}>Irin Jeong</span>
          </div>
          <p style={{ marginTop: "9px", fontSize: "14.5px", lineHeight: 1.65, color: "#5C564B", maxWidth: "640px" }}>
            {BIO}
          </p>
          <div style={{ display: "flex", gap: "8px", marginTop: "14px", flexWrap: "wrap" }}>
            {LINKS.map(({ label, href }) => (
              <a
                key={label}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "inline-flex", alignItems: "center", gap: "5px",
                  fontSize: "13px", color: "#4A4438", textDecoration: "none",
                  border: "1px solid #E5DECF", background: "#FBF8F1",
                  padding: "6px 12px", borderRadius: "999px", fontWeight: 500,
                }}
              >
                {label}
                <span style={{ color: "#B7AD98", fontSize: "11px" }}>↗</span>
              </a>
            ))}
          </div>
        </div>
      </div>

      {/* ── Divider ── */}
      <div style={{ height: "1px", background: "#EFE9DB", margin: "26px 0 20px" }} />

      {/* ── Stats ── */}
      <div style={{ display: "flex", gap: "28px", flexWrap: "wrap", alignItems: "baseline", marginBottom: "18px" }}>
        {[
          { value: stats.totalBits, label: "total bits", accent: false },
          { value: stats.curStreak,  label: "day streak",    accent: true  },
          { value: stats.maxStreak,  label: "longest streak", accent: false },
        ].map(({ value, label, accent }) => (
          <div key={label} style={{ display: "flex", alignItems: "baseline", gap: "7px" }}>
            <span style={{
              fontSize: "22px", fontWeight: 700,
              fontFamily: "var(--font-newsreader),serif",
              color: accent ? "#C96820" : "inherit",
            }}>
              {value}
            </span>
            <span style={{ fontSize: "13px", color: "#A89E89" }}>{label}</span>
          </div>
        ))}
      </div>

      {/* ── Contribution graph ── */}
      <div style={{ overflowX: "auto", paddingBottom: "4px" }}>
        <div style={{ display: "inline-block", minWidth: "100%" }}>
          {/* Month labels */}
          <div style={{ display: "flex", gap: "3px", marginLeft: "30px", marginBottom: "5px" }}>
            {monthLabels.map((label, i) => (
              <div key={i} style={{ width: "13px", fontSize: "10.5px", color: "#B0A691", whiteSpace: "nowrap", lineHeight: 1 }}>
                {label}
              </div>
            ))}
          </div>

          <div style={{ display: "flex", gap: "5px" }}>
            {/* Day labels */}
            <div style={{ display: "flex", flexDirection: "column", gap: "3px", width: "25px", flexShrink: 0 }}>
              {DAY_LABELS.map((label, i) => (
                <div key={i} style={{ height: "13px", fontSize: "10px", color: "#B0A691", lineHeight: "13px", textAlign: "right" }}>
                  {label}
                </div>
              ))}
            </div>

            {/* Weeks grid */}
            <div style={{ display: "flex", gap: "3px" }}>
              {garden.weeks.map((week, wi) => (
                <div key={wi} style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
                  {week.map((day) => (
                    <div
                      key={day.date}
                      title={day.inRange ? `${day.date}: ${day.count} pts` : ""}
                      style={{
                        width: "13px",
                        height: "13px",
                        borderRadius: "3px",
                        background: day.inRange ? JANDI[day.level] : "transparent",
                        outline: day.inRange ? "1px solid rgba(60,50,30,0.04)" : "none",
                        outlineOffset: "-1px",
                      }}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>

          {/* Legend */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", marginTop: "10px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11px", color: "#B0A691" }}>
              <span>Less</span>
              {(Object.values(JANDI) as string[]).map((color) => (
                <div
                  key={color}
                  style={{
                    width: "12px", height: "12px", borderRadius: "3px",
                    background: color,
                    outline: "1px solid rgba(60,50,30,0.04)", outlineOffset: "-1px",
                  }}
                />
              ))}
              <span>More</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
