// buildTokens：DTCG 结构、font.display 条件输出、themeMix 元数据
import test from "node:test";
import assert from "node:assert/strict";
import { buildTokens } from "../src/extract/tokens.js";

function makeSystem(overrides = {}) {
  return {
    pagesAnalyzed: 2,
    colors: {
      mode: "light",
      themeMix: { mixed: false, dark: 0, light: 2, dominant: "light" },
      contrast: 7.5,
      palette: [
        { role: "background", hex: "#ffffff" },
        { role: "foreground", hex: "#4a5565" },
        { role: "primary", hex: "#74d4ff" },
      ],
    },
    spacing: { base: 8, scale: [{ px: 8, count: 10 }, { px: 16, count: 8 }] },
    typography: {
      body: 16,
      ratio: 1.2,
      scale: [{ px: 16, role: "body" }, { px: 84, role: "display" }],
      primaryFont: "Inter",
      displayFont: "GroteskSans",
      secondaryFont: "IBM Plex Mono",
      weights: ["400", "600"],
    },
    radius: { style: "pill", typical: 8, scale: [{ px: 8, count: 5 }, { px: 9999, count: 3 }] },
    shadows: { usage: "layered", levels: [{ shadow: "0 1px 2px rgba(0,0,0,.1)" }] },
    motion: { character: [], libraries: [], hover: { changes: [] }, durations: [], easings: [] },
    density: "balanced",
    siteTokens: { count: 3, sample: {} },
    ...overrides,
  };
}

test("font.display 仅在与正文字体不同时输出", () => {
  const t = buildTokens(makeSystem(), { source: "x" });
  assert.equal(t.font.primary.$value, "Inter");
  assert.equal(t.font.display.$value, "GroteskSans");
  assert.equal(t.font.secondary.$value, "IBM Plex Mono");
});

test("展示字体与正文字体相同时不输出 font.display", () => {
  const sys = makeSystem();
  sys.typography.displayFont = "Inter"; // 与 primary 相同
  const t = buildTokens(sys, { source: "x" });
  assert.equal(t.font.primary.$value, "Inter");
  assert.equal(t.font.display, undefined);
});

test("themeMix 写入 $extensions 元数据", () => {
  const t = buildTokens(makeSystem(), { source: "x" });
  const meta = t.$extensions["haokan.meta"];
  assert.deepEqual(meta.themeMix, { mixed: false, dark: 0, light: 2, dominant: "light" });
  assert.equal(meta.mode, "light");
});

test("color/fontSize/spacing token 结构符合 DTCG", () => {
  const t = buildTokens(makeSystem(), { source: "x" });
  assert.equal(t.color.primary.$type, "color");
  assert.equal(t.color.primary.$value, "#74d4ff");
  assert.equal(t.fontSize.display.$value, "84px");
  assert.equal(t.spacing["s-8"].$value, "8px");
  assert.equal(t.radius.full.$value, "9999px");
});
