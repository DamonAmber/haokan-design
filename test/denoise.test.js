// 去噪：字体展示/正文分离、主题判定与深浅混排、间距/圆角推断
import test from "node:test";
import assert from "node:assert/strict";
import { denoise } from "../src/extract/denoise.js";

const emptyStyles = () => ({
  textColors: {}, bgColors: {}, borderColors: {},
  fontFamilies: {}, fontFamiliesDisplay: {}, fontFamiliesBody: {}, fontFamiliesWeighted: {},
  fontSizes: {}, fontWeights: {}, lineHeights: {}, letterSpacings: {},
  radii: {}, shadows: {}, spacings: {}, cssVars: {},
  transDur: {}, ease: {}, animDur: {}, animName: {}, keyframes: {},
});
const page = (styles) => ({ ok: true, styles: { ...emptyStyles(), ...styles }, meta: { motionLibs: [] }, hover: [] });

test("buildTypography 分离展示字体与正文字体（不被高频等宽带偏）", () => {
  const sys = denoise([
    page({
      bgColors: { "rgb(255,255,255)": 6 },
      textColors: { "rgb(74,85,101)": 4 },
      fontSizes: { "16": 150, "14": 130, "84": 3 },
      fontFamilies: { Inter: 160, "IBM Plex Mono": 130, GroteskSans: 6 },
      fontFamiliesBody: { Inter: 150, "IBM Plex Mono": 70 },
      fontFamiliesDisplay: { GroteskSans: 5 },
      fontFamiliesWeighted: { Inter: 2400, "IBM Plex Mono": 1900, GroteskSans: 420 },
      spacings: { "8": 40, "16": 30, "24": 20 },
    }),
  ]);
  assert.equal(sys.typography.primaryFont, "Inter");
  assert.equal(sys.typography.displayFont, "GroteskSans");
  assert.equal(sys.typography.secondaryFont, "IBM Plex Mono");
});

test("displayFont 无标题级数据时回退到正文字体", () => {
  const sys = denoise([
    page({
      bgColors: { "rgb(255,255,255)": 5 },
      textColors: { "rgb(20,20,20)": 3 },
      fontSizes: { "16": 100 },
      fontFamilies: { Inter: 100 },
      fontFamiliesBody: { Inter: 100 },
      fontFamiliesWeighted: { Inter: 1600 },
      spacings: { "8": 20 },
    }),
  ]);
  assert.equal(sys.typography.primaryFont, "Inter");
  assert.equal(sys.typography.displayFont, "Inter");
});

test("主题判定：聚合主导为深色，themeMix 识别深浅混排", () => {
  const dark = () => page({
    bgColors: { "rgb(15,14,12)": 6 }, textColors: { "rgb(199,193,180)": 4 },
    fontSizes: { "14": 40 }, fontFamilies: { Helvetica: 30 }, fontFamiliesBody: { Helvetica: 25 },
    fontFamiliesWeighted: { Helvetica: 700 }, spacings: { "32": 15 },
  });
  const light = () => page({
    bgColors: { "rgb(245,245,245)": 4 }, textColors: { "rgb(20,20,20)": 3 },
    fontSizes: { "14": 20 }, fontFamilies: { Helvetica: 15 }, fontFamiliesBody: { Helvetica: 12 },
    fontFamiliesWeighted: { Helvetica: 300 }, spacings: { "16": 10 },
  });
  const sys = denoise([dark(), dark(), light()]);
  assert.equal(sys.colors.mode, "dark");
  assert.equal(sys.colors.themeMix.mixed, true);
  assert.equal(sys.colors.themeMix.dark, 2);
  assert.equal(sys.colors.themeMix.light, 1);
});

test("纯浅色站点 themeMix.mixed 为 false", () => {
  const light = () => page({
    bgColors: { "rgb(255,255,255)": 5 }, textColors: { "rgb(20,20,20)": 3 },
    fontSizes: { "16": 40 }, fontFamilies: { Inter: 30 }, fontFamiliesBody: { Inter: 25 },
    fontFamiliesWeighted: { Inter: 640 }, spacings: { "8": 10 },
  });
  const sys = denoise([light(), light()]);
  assert.equal(sys.colors.mode, "light");
  assert.equal(sys.colors.themeMix.mixed, false);
});

test("间距基准与圆角风格推断", () => {
  const sys = denoise([
    page({
      bgColors: { "rgb(255,255,255)": 5 }, textColors: { "rgb(20,20,20)": 3 },
      fontSizes: { "16": 40 }, fontFamilies: { Inter: 30 }, fontFamiliesBody: { Inter: 25 },
      fontFamiliesWeighted: { Inter: 640 },
      spacings: { "8": 50, "16": 40, "24": 30, "32": 20 },
      radii: { "9999": 30, "8": 10 },
    }),
  ]);
  assert.equal(sys.spacing.base, 8);
  assert.equal(sys.radius.style, "pill");
});

test("denoise 对空数据抛错", () => {
  assert.throws(() => denoise([]), /没有可用/);
});
