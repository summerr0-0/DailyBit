import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // cron 스크립트(scripts/curate.ts)가 Next 런타임 밖에서 import하는 모듈 — next/*, server-only 금지
  // (spec: news-curation D3, R11.3)
  {
    files: [
      "src/lib/news-*.ts",
      "src/lib/scrap-*.ts",
      "src/lib/prisma.ts",
      "src/lib/bits.ts",
      "src/lib/threads.ts",
      "src/lib/tags.ts",
      "src/lib/linkify.ts",
      "scripts/**/*.ts",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [{ name: "server-only", message: "Used by scripts/curate.ts outside Next — keep it framework-free." }],
          patterns: [{ group: ["next", "next/*"], message: "Used by scripts/curate.ts outside Next — keep it framework-free." }],
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
