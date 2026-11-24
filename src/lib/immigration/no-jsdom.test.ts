import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Vercel에서 jsdom 로드가 실패해 /immigration이 500이 됐다 (2026-11-24).
// 화면이 읽는 파일은 jsdom을 쓰는 parse.ts·monitor.ts를 런타임으로 import하면 안 된다 (type import는 지워지니 괜찮다).
const root = join(__dirname, "../../..");
const runtimeImports = (file: string) =>
  [...readFileSync(join(root, file), "utf8").matchAll(/^import\s+(?!type\b)[^;]*?from\s+"([^"]+)"/gm)].map((m) => m[1]);

describe("/immigration page stays free of jsdom", () => {
  it.each(["src/app/immigration/page.tsx", "src/lib/immigration/store.ts", "src/lib/immigration/sources.ts"])("%s", (file) => {
    const bad = runtimeImports(file).filter((s) => /jsdom|immigration\/(parse|monitor)$|^\.\/(parse|monitor)$/.test(s));
    expect(bad).toEqual([]);
  });
});
