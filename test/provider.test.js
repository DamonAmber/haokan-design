// 模型视觉能力启发式（纯函数）测试
import test from "node:test";
import assert from "node:assert/strict";
import { guessVisionSupport, maskToken } from "../src/llm/provider.js";

test("guessVisionSupport 识别明确的视觉模型", () => {
  for (const m of [
    "gpt-4o",
    "gpt-4.1-mini",
    "claude-3-5-sonnet-20241022",
    "claude-opus-4-20250514",
    "gemini-2.0-flash",
    "qwen2.5-vl-72b-instruct",
    "glm-4v-plus",
    "internvl2-8b",
    "llava-1.6",
    "pixtral-12b",
  ]) {
    assert.equal(guessVisionSupport(m), true, `${m} 应判为支持视觉`);
  }
});

test("guessVisionSupport 对非对话/纯文本模型返回 false", () => {
  for (const m of ["text-embedding-3-large", "whisper-large-v3", "bge-rerank"]) {
    assert.equal(guessVisionSupport(m), false, `${m} 应判为无视觉`);
  }
});

test("guessVisionSupport 对未知模型返回 null（交给真实探测）", () => {
  for (const m of ["mimo-v2.5-pro", "deepseek-chat", "", null, undefined]) {
    assert.equal(guessVisionSupport(m), null, `${m} 应为未知`);
  }
});

test("maskToken 脱敏", () => {
  assert.equal(maskToken(""), "(none)");
  assert.equal(maskToken("short"), "short");
  assert.equal(maskToken("sk-1234567890abcd"), "sk-1…cd");
});
