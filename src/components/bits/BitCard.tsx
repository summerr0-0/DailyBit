import type { ReactNode } from "react";
import Link from "next/link";
import { TAG_PATTERN } from "@/lib/tags";
import type { BitWithAuthor } from "@/lib/bits";
import { RebitButton } from "./RebitButton";
import { LikeButton } from "./LikeButton";
import { CommentSection } from "./CommentSection";
import { ThreadReplyButton } from "./ThreadReplyButton";

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

type Props = { bit: BitWithAuthor; isLoggedIn?: boolean };

export function BitCard({ bit, isLoggedIn = false }: Props) {
  return (
    <article
      style={{
        background: "#FFFDF8",
        border: "1px solid #E8E1D2",
        borderRadius: "18px",
        padding: "18px 20px",
        boxShadow: "0 1px 2px rgba(60,50,30,0.03)",
        animation: "dbFade 0.3s ease both",
        transition: "border-color 0.15s, box-shadow 0.15s",
      }}
      className="hover:[border-color:#E8C9A5] hover:[box-shadow:0_4px_16px_rgba(60,50,30,0.07)]"
    >
      <div style={{ fontSize: "13px", color: "#A89E89" }}>
        {bit.createdAtLabel}
        {bit.pinned && (
          <span style={{ marginLeft: "8px", color: "#D4A017", fontWeight: 600 }}>
            · Pinned
          </span>
        )}
      </div>

      {bit.thread && (
        <Link
          href={`/threads/${bit.thread.id}`}
          style={{ display: "block", fontSize: "12.5px", color: "#C96820", fontWeight: 600, marginTop: "4px", textDecoration: "none" }}
        >
          Thread: {bit.thread.title}
        </Link>
      )}

      <p style={{ marginTop: "5px", fontSize: "15.5px", lineHeight: 1.68, color: "#33302A", whiteSpace: "pre-wrap" }}>
        {renderContent(bit.content)}
      </p>

      {/* Action bar — flex-wrap so comment panel falls to next row */}
      <div style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: "4px",
        marginTop: "12px",
        paddingTop: "10px",
        borderTop: "1px solid #F4EEE4",
      }}>
        <LikeButton bitId={bit.id} likeCount={bit.likeCount} />
        <RebitButton bitId={bit.id} rebitCount={bit.rebitCount} isLoggedIn={isLoggedIn} />
        <CommentSection bitId={bit.id} commentCount={bit.commentCount} isLoggedIn={isLoggedIn} />
        {isLoggedIn && <ThreadReplyButton bitId={bit.id} />}
      </div>
    </article>
  );
}
