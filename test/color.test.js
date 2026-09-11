// 颜色数学工具测试
import test from "node:test";
import assert from "node:assert/strict";
import {
  parseColor,
  rgbToHex,
  luminance,
  contrastRatio,
  rgbToLab,
  deltaE,
  rgbToHsl,
  isNeutral,
} from "../src/util/color.js";

test("parseColor 解析 hex/rgb/rgba/hsl/transparent", () => {
  assert.deepEqual(parseColor("#fff"), { r: 255, g: 255, b: 255, a: 1 });
  assert.deepEqual(parseColor("#08090a"), { r: 8, g: 9, b: 10, a: 1 });
  assert.deepEqual(parseColor("rgb(10, 20, 30)"), { r: 10, g: 20, b: 30, a: 1 });
  const rgba = parseColor("rgba(0,0,0,0.5)");
  assert.equal(rgba.a, 0.5);
  const red = parseColor("hsl(0, 100%, 50%)");
  assert.deepEqual({ r: red.r, g: red.g, b: red.b }, { r: 255, g: 0, b: 0 });
  assert.equal(parseColor("transparent").a, 0);
  assert.equal(parseColor("not-a-color"), null);
  assert.equal(parseColor(""), null);
  assert.equal(parseColor(null), null);
});

test("parseColor hex8 带 alpha", () => {
  const c = parseColor("#ff000080");
  assert.deepEqual({ r: c.r, g: c.g, b: c.b }, { r: 255, g: 0, b: 0 });
  assert.ok(Math.abs(c.a - 128 / 255) < 1e-6);
});

test("rgbToHex 往返", () => {
  assert.equal(rgbToHex({ r: 255, g: 0, b: 0 }), "#ff0000");
  assert.equal(rgbToHex({ r: 8, g: 9, b: 10 }), "#08090a");
});

test("luminance / contrastRatio 符合 WCAG 边界", () => {
  assert.ok(luminance({ r: 255, g: 255, b: 255 }) > luminance({ r: 0, g: 0, b: 0 }));
  const cr = contrastRatio({ r: 255, g: 255, b: 255 }, { r: 0, g: 0, b: 0 });
  assert.ok(Math.abs(cr - 21) < 0.01);
});

test("deltaE：同色为 0，红绿差异很大", () => {
  const red = rgbToLab({ r: 255, g: 0, b: 0 });
  const green = rgbToLab({ r: 0, g: 255, b: 0 });
  assert.equal(deltaE(red, red), 0);
  assert.ok(deltaE(red, green) > 50);
});

test("rgbToHsl / isNeutral 区分中性色与饱和色", () => {
  const gray = { r: 128, g: 128, b: 128 };
  const red = { r: 220, g: 20, b: 60 };
  assert.ok(isNeutral(gray));
  assert.ok(!isNeutral(red));
  assert.ok(rgbToHsl(red).s > 0.5);
  assert.ok(rgbToHsl(gray).s < 0.05);
});
