"use client";

import { useEffect, useId, useState } from "react";

// ```mermaid 블록을 SVG 도표로 그린다 (사용자 요청 2026-11-20).
// mermaid는 무거워서 도표가 있을 때만 동적으로 불러온다. securityLevel "strict" — 클릭 핸들러·HTML 라벨 차단, SVG는 DOMPurify로 정화.
// 문법 오류면 원문 코드를 그대로 보여 준다. p 안에 들어가므로 div 대신 span(display:block)을 쓴다.

let ready: Promise<typeof import("mermaid").default> | null = null;
function loadMermaid() {
  ready ??= import("mermaid")
    .then((m) => {
      // suppressErrorRendering: 문법 오류 시 mermaid가 body에 오류 SVG를 남기지 않게 (Gemini mermaid #1)
      m.default.initialize({
        startOnLoad: false,
        securityLevel: "strict",
        suppressErrorRendering: true,
        theme: "neutral",
        fontFamily: "inherit",
      });
      return m.default;
    })
    .catch((e) => {
      ready = null; // 일시적 로드 실패는 다음 도표에서 다시 시도 (Gemini mermaid #3)
      throw e;
    });
  return ready;
}

export function MermaidDiagram({ code }: { code: string }) {
  const id = `mmd-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    loadMermaid()
      .then((mermaid) => mermaid.render(id, code))
      .then(({ svg }) => alive && (setSvg(svg), setFailed(false)))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [id, code]);

  if (failed || svg === null) {
    return (
      <CodeBlock code={code} note={failed ? "Diagram could not be drawn — showing the source." : undefined} />
    );
  }
  return (
    <span
      data-testid="mermaid-diagram"
      role="img"
      aria-label="Diagram"
      style={{ display: "block", margin: "8px 0", overflowX: "auto", textAlign: "center", whiteSpace: "normal" }}
      // mermaid strict 모드가 DOMPurify로 정화한 SVG
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

export function CodeBlock({ code, note }: { code: string; note?: string }) {
  return (
    <span style={{ display: "block", margin: "8px 0" }}>
      <code
        style={{
          display: "block",
          whiteSpace: "pre",
          overflowX: "auto",
          fontSize: 13,
          lineHeight: 1.5,
          padding: "10px 12px",
          borderRadius: 10,
          background: "#F3EEE4",
          color: "#3C3220",
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        }}
      >
        {code}
      </code>
      {note && <span style={{ display: "block", fontSize: 11.5, color: "#9C4A1A", marginTop: 4 }}>{note}</span>}
    </span>
  );
}
