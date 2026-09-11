// 设计 lint：颜色/圆角/字体越界检测与命中 token 不误报
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { lintProject } from "../src/lint/linter.js";

const tokens = {
  color: {
    background: { $type: "color", $value: "#ffffff" },
    foreground: { $type: "color", $value: "#111111" },
    primary: { $type: "color", $value: "#0a84ff" },
  },
  radius: {
    "r-8": { $type: "dimension", $value: "8px" },
    full: { $type: "dimension", $value: "9999px" },
  },
  font: {
    primary: { $type: "fontFamily", $value: "Inter" },
    secondary: { $type: "fontFamily", $value: "IBM Plex Mono" },
  },
  spacing: {}, fontSize: {}, shadow: {}, duration: {}, easing: {},
};

const CSS = `
.a { color: #ff00ff; }              /* 越界颜色 → error */
.b { color: #0a84ff; }              /* 命中 primary → 不报 */
.c { border-radius: 13px; }         /* 越界圆角 → warn */
.d { border-radius: 8px; }          /* 命中 → 不报 */
.e { font-family: "Comic Sans MS", sans-serif; }  /* 非规范字体 → warn */
.f { font-family: Inter, sans-serif; }            /* 命中 → 不报 */
`;

let dir;
test.before(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "haokan-lint-"));
  fs.writeFileSync(path.join(dir, "style.css"), CSS);
});
test.after(() => {
  if (dir) fs.rmSync(dir, { recursive: true, force: true });
});

test("扫描到文件并给出合规分", () => {
  const rep = lintProject(tokens, dir);
  assert.ok(rep.filesScanned >= 1);
  assert.ok(rep.score < 100, "存在违规，分数应低于 100");
  assert.equal(typeof rep.counts.total, "number");
});

test("越界颜色报 error，命中 token 的颜色不报", () => {
  const rep = lintProject(tokens, dir);
  const colors = rep.violations.filter((v) => v.type === "color");
  assert.ok(colors.some((v) => v.value === "#ff00ff" && v.severity === "error"));
  assert.ok(!colors.some((v) => v.value === "#0a84ff"), "命中 primary 不应报");
});

test("越界圆角与非规范字体各报一处，命中的不报", () => {
  const rep = lintProject(tokens, dir);
  const radii = rep.violations.filter((v) => v.type === "radius");
  assert.ok(radii.some((v) => v.value === "13px"));
  assert.ok(!radii.some((v) => v.value === "8px"));
  const fonts = rep.violations.filter((v) => v.type === "font");
  assert.ok(fonts.some((v) => v.value === "comic sans ms"));
  assert.ok(!fonts.some((v) => v.value === "inter"));
});
