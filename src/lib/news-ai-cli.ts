import { spawn } from "node:child_process";
import type Anthropic from "@anthropic-ai/sdk";
import type { NewsAiClient } from "./news-ai";

// Claude Code CLI(`claude -p`) 백엔드 — API 키 없이 Claude 구독으로 뉴스 AI를 돌린다.
// NEWS_AI_BACKEND=cli 일 때 news-ai가 이 클라이언트를 쓴다. GitHub Actions에서는
// `claude setup-token`으로 만든 CLAUDE_CODE_OAUTH_TOKEN으로 인증한다.
// 도구·MCP·설정·세션 저장을 모두 끄고, 시스템 프롬프트를 우리 것으로 대체해 텍스트 → JSON만 받는다.

const CLI_TIMEOUT_MS = 180_000;

type CliResult = { is_error?: boolean; structured_output?: unknown; result?: string; subtype?: string };

export type RunCli = (args: string[], stdin: string) => Promise<string>;

/** `claude` 프로세스를 실행해 stdout을 돌려준다. 0이 아닌 종료·타임아웃은 throw. */
export const runClaudeCli: RunCli = (args, stdin) =>
  new Promise((resolve, reject) => {
    const child = spawn(process.env.CLAUDE_CLI_PATH ?? "claude", args, { stdio: ["pipe", "pipe", "pipe"] });
    let out = "";
    let err = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("claude cli timeout"));
    }, CLI_TIMEOUT_MS);
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(out);
      else reject(new Error(`claude cli exited ${code}: ${err.slice(0, 500)}`));
    });
    child.stdin.end(stdin);
  });

function textOfContent(content: Anthropic.MessageCreateParamsNonStreaming["messages"][number]["content"]): string {
  if (typeof content === "string") return content;
  return content
    .filter((b): b is Anthropic.TextBlockParam => b.type === "text")
    .map((b) => b.text)
    .join("\n");
}

/** messages.create 파라미터를 `claude -p` 인자로 바꾼다. */
export function buildCliArgs(params: Anthropic.MessageCreateParamsNonStreaming): string[] {
  const system = typeof params.system === "string" ? params.system : (params.system ?? []).map((b) => b.text).join("\n");
  const format = (params as { output_config?: { format?: { schema?: unknown } } }).output_config?.format;
  const args = [
    "-p",
    "--output-format",
    "json",
    "--model",
    params.model,
    "--system-prompt",
    system,
    "--tools",
    "",
    "--strict-mcp-config",
    "--setting-sources",
    "",
    "--disable-slash-commands",
    "--no-session-persistence",
  ];
  if (format?.schema) args.push("--json-schema", JSON.stringify(format.schema));
  return args;
}

/** NewsAiClient 구현: CLI 결과의 structured_output을 텍스트 블록 JSON으로 감싸 SDK 응답처럼 돌려준다. */
export function createCliClient(run: RunCli = runClaudeCli): NewsAiClient {
  return {
    messages: {
      async create(params) {
        const prompt = params.messages.map((m) => textOfContent(m.content)).join("\n\n");
        const stdout = await run(buildCliArgs(params), prompt);
        const parsed = JSON.parse(stdout) as CliResult;
        if (parsed.is_error) throw new Error(`claude cli error: ${parsed.subtype ?? parsed.result ?? "unknown"}`);
        const text = parsed.structured_output !== undefined ? JSON.stringify(parsed.structured_output) : (parsed.result ?? "");
        return {
          id: "cli",
          type: "message",
          role: "assistant",
          model: params.model,
          content: [{ type: "text", text, citations: null }],
          stop_reason: "end_turn",
          stop_sequence: null,
          usage: { input_tokens: 0, output_tokens: 0 },
        } as unknown as Anthropic.Message;
      },
    },
  };
}
