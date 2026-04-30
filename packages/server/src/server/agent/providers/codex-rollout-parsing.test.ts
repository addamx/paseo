import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { rmSync, mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseRolloutFile } from "./codex-rollout-timeline.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "rollout-test-"));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("exec_command parsing", () => {
  test("parses exec_command as Bash tool call with command", async () => {
    const rolloutPath = join(tmpDir, "rollout.jsonl");
    const lines = [
      JSON.stringify({
        timestamp: "2026-01-22T07:09:01.348Z",
        type: "response_item",
        payload: {
          type: "function_call",
          name: "exec_command",
          arguments: '{"cmd":"task show cc4ea7d1"}',
          call_id: "call_MhTWDF2mpM4dhbNmHNt6ikDF",
        },
      }),
    ];
    writeFileSync(rolloutPath, lines.join("\n") + "\n");

    const timeline = await parseRolloutFile(rolloutPath);

    const toolCalls = timeline.filter((i) => i.type === "tool_call");
    expect(toolCalls.length).toBe(1);
    expect(toolCalls[0]).toMatchObject({
      type: "tool_call",
      name: "Bash",
      callId: "call_MhTWDF2mpM4dhbNmHNt6ikDF",
      detail: { type: "shell", command: "task show cc4ea7d1" },
    });
  });

  test("includes function_call_output as tool call output", async () => {
    const rolloutPath = join(tmpDir, "rollout.jsonl");
    const lines = [
      JSON.stringify({
        timestamp: "2026-01-22T07:09:01.348Z",
        type: "response_item",
        payload: {
          type: "function_call",
          name: "exec_command",
          arguments: '{"cmd":"echo hello"}',
          call_id: "call_abc123",
        },
      }),
      JSON.stringify({
        timestamp: "2026-01-22T07:09:01.785Z",
        type: "response_item",
        payload: {
          type: "function_call_output",
          call_id: "call_abc123",
          output:
            "Chunk ID: 13d232\nWall time: 0.2667 seconds\nProcess exited with code 0\nOriginal token count: 10\nOutput:\nhello",
        },
      }),
    ];
    writeFileSync(rolloutPath, lines.join("\n") + "\n");

    const timeline = await parseRolloutFile(rolloutPath);

    const toolCalls = timeline.filter((i) => i.type === "tool_call");
    expect(toolCalls.length).toBe(1);
    expect(toolCalls[0]).toMatchObject({
      type: "tool_call",
      name: "Bash",
      callId: "call_abc123",
      detail: {
        type: "shell",
        command: "echo hello",
        output: "hello",
      },
    });
  });

  test("maps write_stdin polling calls into terminal interaction tool calls", async () => {
    const rolloutPath = join(tmpDir, "rollout.jsonl");
    const lines = [
      JSON.stringify({
        timestamp: "2026-01-22T07:09:01.348Z",
        type: "response_item",
        payload: {
          type: "function_call",
          name: "exec_command",
          arguments: '{"cmd":"npm test"}',
          call_id: "call_real",
        },
      }),
      JSON.stringify({
        timestamp: "2026-01-22T07:09:01.785Z",
        type: "response_item",
        payload: {
          type: "function_call_output",
          call_id: "call_real",
          output:
            "Chunk ID: 13d232\nWall time: 0.2667 seconds\nProcess exited with code 0\nOriginal token count: 10\nOutput:\nProcess running with session ID 7144",
        },
      }),
      JSON.stringify({
        timestamp: "2026-01-22T07:28:16.497Z",
        type: "response_item",
        payload: {
          type: "function_call",
          name: "write_stdin",
          arguments: '{"session_id":7144,"chars":"","yield_time_ms":1000,"max_output_tokens":6000}',
          call_id: "call_polling",
        },
      }),
    ];
    writeFileSync(rolloutPath, lines.join("\n") + "\n");

    const timeline = await parseRolloutFile(rolloutPath);

    const toolCalls = timeline.filter((i) => i.type === "tool_call");
    expect(toolCalls.length).toBe(2);
    expect(toolCalls[0]).toMatchObject({
      type: "tool_call",
      name: "Bash",
    });
    expect(toolCalls[1]).toMatchObject({
      type: "tool_call",
      name: "terminal",
      callId: "terminal-session-7144",
      detail: {
        type: "plain_text",
        icon: "square_terminal",
      },
      metadata: {
        processId: "7144",
      },
    });
  });

  test("falls back to generic terminal interaction label when command cannot be resolved", async () => {
    const rolloutPath = join(tmpDir, "rollout.jsonl");
    const lines = [
      JSON.stringify({
        timestamp: "2026-01-22T07:28:16.497Z",
        type: "response_item",
        payload: {
          type: "function_call",
          name: "write_stdin",
          arguments: '{"session_id":7144,"chars":"","yield_time_ms":1000,"max_output_tokens":6000}',
          call_id: "call_polling",
        },
      }),
    ];
    writeFileSync(rolloutPath, lines.join("\n") + "\n");

    const timeline = await parseRolloutFile(rolloutPath);
    const toolCalls = timeline.filter((i) => i.type === "tool_call");
    expect(toolCalls).toHaveLength(1);
    expect(toolCalls[0]).toMatchObject({
      type: "tool_call",
      name: "terminal",
      callId: "terminal-session-7144",
      detail: {
        type: "plain_text",
        icon: "square_terminal",
      },
    });
  });
});

describe("older shell format", () => {
  test("parses shell command as Bash tool call", async () => {
    const rolloutPath = join(tmpDir, "rollout.jsonl");
    const lines = [
      JSON.stringify({
        timestamp: "2025-11-03T14:37:50.400Z",
        type: "response_item",
        payload: {
          type: "function_call",
          name: "shell",
          arguments: '{"command":["bash","-lc","ls -la"],"workdir":"/Users/test/project"}',
          call_id: "call_shell123",
        },
      }),
    ];
    writeFileSync(rolloutPath, lines.join("\n") + "\n");

    const timeline = await parseRolloutFile(rolloutPath);

    const toolCalls = timeline.filter((i) => i.type === "tool_call");
    expect(toolCalls.length).toBe(1);
    expect(toolCalls[0]).toMatchObject({
      type: "tool_call",
      name: "Bash",
      callId: "call_shell123",
      detail: { type: "shell", command: "ls -la" },
    });
  });
});

describe("real rollout file structure", () => {
  test("parses user message correctly", async () => {
    const rolloutPath = join(tmpDir, "rollout.jsonl");
    const lines = [
      JSON.stringify({
        timestamp: "2026-01-22T07:08:54.378Z",
        type: "response_item",
        payload: {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: "Fix the bug in auth.ts" }],
        },
      }),
    ];
    writeFileSync(rolloutPath, lines.join("\n") + "\n");

    const timeline = await parseRolloutFile(rolloutPath);

    expect(timeline).toContainEqual({
      type: "user_message",
      text: "Fix the bug in auth.ts",
    });
  });

  test("parses assistant message correctly", async () => {
    const rolloutPath = join(tmpDir, "rollout.jsonl");
    const lines = [
      JSON.stringify({
        timestamp: "2026-01-22T07:08:54.378Z",
        type: "response_item",
        payload: {
          type: "message",
          role: "assistant",
          content: [{ type: "output_text", text: "I'll fix that for you." }],
        },
      }),
    ];
    writeFileSync(rolloutPath, lines.join("\n") + "\n");

    const timeline = await parseRolloutFile(rolloutPath);

    expect(timeline).toContainEqual({
      type: "assistant_message",
      text: "I'll fix that for you.",
    });
  });

  test("parses reasoning correctly", async () => {
    const rolloutPath = join(tmpDir, "rollout.jsonl");
    const lines = [
      JSON.stringify({
        timestamp: "2026-01-22T07:08:54.378Z",
        type: "response_item",
        payload: {
          type: "reasoning",
          content: [{ type: "reasoning_text", text: "Let me think about this." }],
        },
      }),
    ];
    writeFileSync(rolloutPath, lines.join("\n") + "\n");

    const timeline = await parseRolloutFile(rolloutPath);

    expect(timeline).toContainEqual({
      type: "reasoning",
      text: "Let me think about this.",
    });
  });

  test("parses legacy response_item shape using item", async () => {
    const rolloutPath = join(tmpDir, "rollout.jsonl");
    const lines = [
      JSON.stringify({
        timestamp: "2026-01-22T07:08:54.378Z",
        type: "response_item",
        item: {
          type: "function_call",
          name: "exec_command",
          arguments: '{"cmd":"echo hello"}',
          call_id: "call_legacy_1",
        },
      }),
      JSON.stringify({
        timestamp: "2026-01-22T07:09:01.785Z",
        type: "response_item",
        item: {
          type: "function_call_output",
          call_id: "call_legacy_1",
          output: "hello",
        },
      }),
    ];
    writeFileSync(rolloutPath, lines.join("\n") + "\n");

    const timeline = await parseRolloutFile(rolloutPath);
    const toolCalls = timeline.filter((i) => i.type === "tool_call");
    expect(toolCalls.length).toBe(1);
    expect(toolCalls[0]).toMatchObject({
      type: "tool_call",
      name: "Bash",
      callId: "call_legacy_1",
      detail: { type: "shell", command: "echo hello", output: "hello" },
    });
  });

  test("parses custom_tool_call apply_patch with input/output into editable tool detail", async () => {
    const rolloutPath = join(tmpDir, "rollout.jsonl");
    const patch = [
      "*** Begin Patch",
      "*** Add File: src/new-file.ts",
      "+export const value = 1;",
      "*** End Patch",
    ].join("\n");
    const lines = [
      JSON.stringify({
        timestamp: "2026-02-09T10:00:00.000Z",
        type: "response_item",
        payload: {
          type: "custom_tool_call",
          name: "apply_patch",
          call_id: "call_patch_custom_1",
          input: patch,
        },
      }),
      JSON.stringify({
        timestamp: "2026-02-09T10:00:01.000Z",
        type: "response_item",
        payload: {
          type: "custom_tool_call_output",
          call_id: "call_patch_custom_1",
          output:
            '{"output":"Success. Updated the following files:\\nA src/new-file.ts\\n","metadata":{"exit_code":0}}',
        },
      }),
    ];
    writeFileSync(rolloutPath, lines.join("\n") + "\n");

    const timeline = await parseRolloutFile(rolloutPath);
    const toolCalls = timeline.filter((i) => i.type === "tool_call");
    expect(toolCalls.length).toBe(1);

    const patchCall = toolCalls[0];
    expect(patchCall).toMatchObject({
      type: "tool_call",
      name: "apply_patch",
      callId: "call_patch_custom_1",
      status: "completed",
    });
    expect(patchCall.detail.type).toBe("edit");
    if (patchCall.detail.type === "edit") {
      expect(patchCall.detail.filePath).toBe("src/new-file.ts");
      expect(patchCall.detail.unifiedDiff).toContain("diff --git");
      expect(patchCall.detail.unifiedDiff).toContain("+export const value = 1;");
      expect(patchCall.detail.unifiedDiff).not.toContain("*** Begin Patch");
    }
  });

  test("parses legacy event_msg shape using msg", async () => {
    const rolloutPath = join(tmpDir, "rollout.jsonl");
    const lines = [
      JSON.stringify({
        timestamp: "2026-01-22T07:08:54.378Z",
        type: "event_msg",
        msg: {
          type: "agent_reasoning",
          text: "thinking",
        },
      }),
      JSON.stringify({
        timestamp: "2026-01-22T07:08:54.378Z",
        type: "event_msg",
        msg: {
          type: "agent_message",
          message: { role: "assistant", message: "done" },
        },
      }),
      JSON.stringify({
        timestamp: "2026-01-22T07:08:54.378Z",
        type: "event_msg",
        msg: {
          type: "user_message",
          message: { role: "user", message: "question" },
        },
      }),
    ];
    writeFileSync(rolloutPath, lines.join("\n") + "\n");

    const timeline = await parseRolloutFile(rolloutPath);
    expect(timeline).toContainEqual({ type: "reasoning", text: "thinking" });
    expect(timeline).toContainEqual({ type: "assistant_message", text: "done" });
    expect(timeline).toContainEqual({ type: "user_message", text: "question" });
  });

  test("deduplicates mirrored response_item and event_msg text records", async () => {
    const rolloutPath = join(tmpDir, "rollout.jsonl");
    const lines = [
      JSON.stringify({
        timestamp: "2026-01-22T07:08:54.000Z",
        type: "response_item",
        payload: {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: "question" }],
        },
      }),
      JSON.stringify({
        timestamp: "2026-01-22T07:08:54.001Z",
        type: "event_msg",
        payload: {
          type: "user_message",
          message: "question",
        },
      }),
      JSON.stringify({
        timestamp: "2026-01-22T07:08:54.010Z",
        type: "response_item",
        payload: {
          type: "reasoning",
          content: [{ type: "reasoning_text", text: "thinking" }],
        },
      }),
      JSON.stringify({
        timestamp: "2026-01-22T07:08:54.011Z",
        type: "event_msg",
        payload: {
          type: "agent_reasoning",
          text: "thinking",
        },
      }),
      JSON.stringify({
        timestamp: "2026-01-22T07:08:54.020Z",
        type: "response_item",
        payload: {
          type: "message",
          role: "assistant",
          content: [{ type: "output_text", text: "answer" }],
        },
      }),
      JSON.stringify({
        timestamp: "2026-01-22T07:08:54.021Z",
        type: "event_msg",
        payload: {
          type: "agent_message",
          message: "answer",
        },
      }),
    ];
    writeFileSync(rolloutPath, lines.join("\n") + "\n");

    const timeline = await parseRolloutFile(rolloutPath);
    expect(timeline).toEqual([
      { type: "user_message", text: "question" },
      { type: "reasoning", text: "thinking" },
      { type: "assistant_message", text: "answer" },
    ]);
  });
});

describe("generated image parsing", () => {
  const generatedImageNoticeText = (imageDir: string, templatePath: string) =>
    [
      `Generated images are saved to ${imageDir} as ${templatePath} by default.`,
      "If you need to use a generated image at another path, copy it and leave the original in place unless the user explicitly asks you to delete it.",
    ].join("\n");
  const fileUriForPath = (filePath: string) => {
    const normalized = filePath.replace(/\\/g, "/");
    return normalized.startsWith("/") ? `file://${normalized}` : `file:///${normalized}`;
  };

  test("emits whitelisted developer generated image notices with file markdown", async () => {
    const rolloutPath = join(tmpDir, "rollout.jsonl");
    const imageDir = join(tmpDir, "generated_images", "thread-1");
    const callId = "ig_abc123";
    const templatePath = join(imageDir, "_image_id_.png");
    mkdirSync(imageDir, { recursive: true });
    writeFileSync(join(imageDir, `${callId}.png`), "png");

    const noticeText = generatedImageNoticeText(imageDir, templatePath);
    const imagePath = join(imageDir, `${callId}.png`);
    const lines = [
      JSON.stringify({
        timestamp: "2026-04-30T08:20:19.690Z",
        type: "response_item",
        payload: {
          type: "message",
          role: "developer",
          content: [{ type: "input_text", text: noticeText }],
        },
      }),
      JSON.stringify({
        timestamp: "2026-04-30T08:20:19.727Z",
        type: "event_msg",
        payload: {
          type: "image_generation_end",
          call_id: callId,
          status: "generating",
          result: "large-base64-payload",
        },
      }),
    ];
    writeFileSync(rolloutPath, lines.join("\n") + "\n");

    const timeline = await parseRolloutFile(rolloutPath);

    expect(timeline).toEqual([
      {
        type: "assistant_message",
        text: `${noticeText}\n\n![Generated image](${fileUriForPath(imagePath)})`,
      },
    ]);
  });

  test("ignores ordinary developer messages and keeps missing image notices text-only", async () => {
    const rolloutPath = join(tmpDir, "rollout.jsonl");
    const imageDir = join(tmpDir, "generated_images", "thread-2");
    const callId = "ig_missing";
    const templatePath = join(imageDir, "_image_id_.png");
    const noticeText = generatedImageNoticeText(imageDir, templatePath);

    const lines = [
      JSON.stringify({
        timestamp: "2026-04-30T08:20:10.000Z",
        type: "response_item",
        payload: {
          type: "message",
          role: "developer",
          content: [{ type: "input_text", text: "Internal developer instructions" }],
        },
      }),
      JSON.stringify({
        timestamp: "2026-04-30T08:20:19.690Z",
        type: "response_item",
        payload: {
          type: "message",
          role: "developer",
          content: [{ type: "input_text", text: noticeText }],
        },
      }),
      JSON.stringify({
        timestamp: "2026-04-30T08:20:19.727Z",
        type: "event_msg",
        payload: {
          type: "image_generation_end",
          call_id: callId,
        },
      }),
    ];
    writeFileSync(rolloutPath, lines.join("\n") + "\n");

    const timeline = await parseRolloutFile(rolloutPath);

    expect(timeline).toEqual([{ type: "assistant_message", text: noticeText }]);
  });
});

describe("complex conversation", () => {
  test("parses a full conversation with commands and outputs", async () => {
    const rolloutPath = join(tmpDir, "rollout.jsonl");
    const lines = [
      // User message
      JSON.stringify({
        timestamp: "2026-01-22T07:08:54.378Z",
        type: "response_item",
        payload: {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: "Run npm test" }],
        },
      }),
      // Reasoning
      JSON.stringify({
        timestamp: "2026-01-22T07:08:55.000Z",
        type: "response_item",
        payload: {
          type: "reasoning",
          content: [{ type: "reasoning_text", text: "I need to run the tests." }],
        },
      }),
      // Command
      JSON.stringify({
        timestamp: "2026-01-22T07:09:01.348Z",
        type: "response_item",
        payload: {
          type: "function_call",
          name: "exec_command",
          arguments: '{"cmd":"npm test"}',
          call_id: "call_test",
        },
      }),
      // Command output
      JSON.stringify({
        timestamp: "2026-01-22T07:09:05.000Z",
        type: "response_item",
        payload: {
          type: "function_call_output",
          call_id: "call_test",
          output:
            "Chunk ID: abc\nWall time: 3.5 seconds\nProcess exited with code 0\nOutput:\nAll tests passed!",
        },
      }),
      // Assistant response
      JSON.stringify({
        timestamp: "2026-01-22T07:09:06.000Z",
        type: "response_item",
        payload: {
          type: "message",
          role: "assistant",
          content: [{ type: "output_text", text: "All tests passed!" }],
        },
      }),
    ];
    writeFileSync(rolloutPath, lines.join("\n") + "\n");

    const timeline = await parseRolloutFile(rolloutPath);

    // Should have: user_message, reasoning, tool_call (with output), assistant_message
    expect(timeline.length).toBe(4);

    expect(timeline[0]).toMatchObject({ type: "user_message", text: "Run npm test" });
    expect(timeline[1]).toMatchObject({
      type: "reasoning",
      text: "I need to run the tests.",
    });
    expect(timeline[2]).toMatchObject({
      type: "tool_call",
      name: "Bash",
      detail: {
        type: "shell",
        command: "npm test",
        output: "All tests passed!",
      },
    });
    expect(timeline[3]).toMatchObject({
      type: "assistant_message",
      text: "All tests passed!",
    });
  });
});
