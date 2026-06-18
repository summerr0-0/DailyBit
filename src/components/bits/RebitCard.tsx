import type { BitWithAuthor } from "@/lib/bits";
import { BitCard } from "./BitCard";

type Props = {
  rebitAtLabel: string;
  message: string | null;
  bit: BitWithAuthor;
  isLoggedIn?: boolean;
};

export function RebitCard({ rebitAtLabel, message, bit, isLoggedIn }: Props) {
  return (
    <div>
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: "6px",
        fontSize: "12.5px",
        color: "#C96820",
        marginBottom: "6px",
        paddingLeft: "4px",
      }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 1l4 4-4 4"/>
          <path d="M3 11V9a4 4 0 014-4h14"/>
          <path d="M7 23l-4-4 4-4"/>
          <path d="M21 13v2a4 4 0 01-4 4H3"/>
        </svg>
        <span>Irin rebitted · {rebitAtLabel}</span>
      </div>
      {message && (
        <p style={{
          fontSize: "14.5px",
          lineHeight: 1.6,
          color: "#4A4438",
          background: "#FEF3E8",
          border: "1px solid #F4DEC9",
          borderRadius: "12px",
          padding: "10px 14px",
          marginBottom: "8px",
        }}>
          {message}
        </p>
      )}
      <BitCard bit={bit} isLoggedIn={isLoggedIn} />
    </div>
  );
}
