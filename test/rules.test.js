// 集成文件生成：字体回退族按类型选择、CSS 变量与 Tailwind 配置
import test from "node:test";
import assert from "node:assert/strict";
import { familyKind, fallbackStack, toCssVars, toTailwind } from "../src/pack/rules.js";

test("familyKind 按字体名归类", () => {
  assert.equal(familyKind("IBM Plex Mono"), "mono");
  assert.equal(familyKind("plexMono"), "mono");
  assert.equal(familyKind("JetBrains Mono"), "mono");
  assert.equal(familyKind("Georgia"), "serif");
  assert.equal(familyKind("Noto Serif SC"), "serif");
  assert.equal(familyKind("Inter"), "sans");
  assert.equal(familyKind("Source Sans"), "sans"); // 含 sans 不误判为 serif
});

test("fallbackStack：等宽回退 monospace，不再硬编码 serif", () => {
  assert.match(fallbackStack("IBM Plex Mono"), /monospace$/);
  assert.match(fallbackStack("Inter"), /sans-serif$/);
  assert.match(fallbackStack("Georgia"), /serif$/);
  assert.doesNotMatch(fallbackStack("IBM Plex Mono"), /(?<!ui-mono)serif/); // 等宽不含 serif 回退
});

const tokens = {
  color: { primary: { $type: "color", $value: "#000000" } },
  font: {
    primary: { $type: "fontFamily", $value: "plexMono" },
    display: { $type: "fontFamily", $value: "inter" },
    secondary: { $type: "fontFamily", $value: "IBM Plex Mono" },
  },
  fontSize: {}, spacing: {}, radius: {}, shadow: {}, duration: {}, easing: {},
};

test("toCssVars 输出 --font-primary/display/secondary 且回退合理", () => {
  const css = toCssVars(tokens);
  assert.match(css, /--font-primary: plexMono, ui-monospace/);
  assert.match(css, /--font-display: inter, system-ui/);
  assert.match(css, /--font-secondary: IBM Plex Mono, ui-monospace/);
});

test("toTailwind 次字体按类型归入 mono 键", () => {
  const tw = toTailwind(tokens);
  const obj = JSON.parse(tw.replace(/^[^{]*/, "").replace(/;\s*$/, ""));
  const ff = obj.extend.fontFamily;
  assert.deepEqual(ff.sans[0], "plexMono");
  assert.deepEqual(ff.display[0], "inter");
  assert.ok(ff.mono, "等宽次字体应归入 mono 键");
  assert.equal(ff.mono[0], "IBM Plex Mono");
  assert.equal(ff.mono[ff.mono.length - 1], "monospace");
});
