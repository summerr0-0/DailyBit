import { describe, expect, it, vi } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { buildCliArgs, createCliClient, type RunCli } from "./news-ai-cli";

const params = {
  model: "claude-haiku-5-5",
  max_tokens: 1000,
  system: "SYSTEM",
  messages: [{ role: "user", content: "hello" }],
  output_config: { format: { type: "json_schema", schema: { type: "object" } } },
} as unknown as Anthropic.MessageCreateParamsNonStreaming;

describe("buildCliArgs", () => {
  it("runs headless with our system prompt, no tools/MCP/settings, and the JSON schema", () => {
    const args = buildCliArgs(params);
    expect(args).toEqual(
      expect.arrayContaining(["-p", "--output-format", "json", "--strict-mcp-config", "--no-session-persistence"]),
    );
    expect(args[args.indexOf("--model") + 1]).toBe("claude-haiku-5-5");
    expect(args[args.indexOf("--system-prompt") + 1]).toBe("SYSTEM");
    expect(args[args.indexOf("--tools") + 1]).toBe("");
    expect(args[args.indexOf("--json-schema") + 1]).toBe('{"type":"object"}');
  });
});

describe("createCliClient", () => {
  it("passes the user message on stdin and returns structured_output as a text block", async () => {
    const run = vi.fn<RunCli>(async () => JSON.stringify({ is_error: false, structured_output: { scores: [{ id: 0, score: 7 }] } }));
    const msg = await createCliClient(run).messages.create(params);
    expect(run.mock.calls[0][1]).toBe("hello");
    expect(msg.stop_reason).toBe("end_turn");
    expect(msg.content[0]).toMatchObject({ type: "text", text: '{"scores":[{"id":0,"score":7}]}' });
  });

  it("throws on a CLI error result so news-ai reports ai_failed", async () => {
    const run = async () => JSON.stringify({ is_error: true, subtype: "error_max_turns" });
    await expect(createCliClient(run).messages.create(params)).rejects.toThrow("error_max_turns");
  });
});
