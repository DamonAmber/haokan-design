// LLM Provider —— 复用本地 Claude Code / CC Switch 当前生效配置调用模型。
// 解析顺序：进程环境变量 > ~/.claude/settings.json 的 env > 默认值。
// 模型名一律从配置读取，因此在 CC Switch 里切换上游后本模块无需改动。
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const SETTINGS_PATH = path.join(os.homedir(), ".claude", "settings.json");
const ANTHROPIC_VERSION = "2023-06-01";

// —— App 独立模型配置：让用户在本 App 内配置专属模型，无需依赖 Claude Code ——
// 存于 ~/.haokan/model.json（npm run gallery 与桌面 App 都可读）。
const APP_DIR = path.join(os.homedir(), ".haokan");
const APP_MODEL_PATH = path.join(APP_DIR, "model.json");

export function appModelConfigPath() {
  return APP_MODEL_PATH;
}
export function readAppModelConfig() {
  try {
    const c = JSON.parse(fs.readFileSync(APP_MODEL_PATH, "utf8"));
    return c && typeof c === "object" ? c : null;
  } catch {
    return null;
  }
}
export function writeAppModelConfig(cfg = {}) {
  fs.mkdirSync(APP_DIR, { recursive: true });
  const clean = {
    baseURL: String(cfg.baseURL || "").trim().replace(/\/+$/, ""),
    authToken: String(cfg.authToken || "").trim(),
    model: String(cfg.model || "").trim(),
    updatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(APP_MODEL_PATH, JSON.stringify(clean, null, 2));
  return clean;
}
export function clearAppModelConfig() {
  try {
    fs.rmSync(APP_MODEL_PATH, { force: true });
    return true;
  } catch {
    return false;
  }
}

function readSettings() {
  try {
    const raw = fs.readFileSync(SETTINGS_PATH, "utf8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

// 解析当前生效配置。优先级：进程环境变量 > App 独立配置 > Claude Code settings > 默认。
export function resolveConfig() {
  const settings = readSettings();
  const env = settings.env || {};
  const app = readAppModelConfig() || {};
  const appActive = !!(app.baseURL || app.authToken || app.model);

  const baseURL =
    process.env.ANTHROPIC_BASE_URL ||
    app.baseURL ||
    env.ANTHROPIC_BASE_URL ||
    "https://api.anthropic.com";
  const authToken =
    process.env.ANTHROPIC_AUTH_TOKEN ||
    process.env.ANTHROPIC_API_KEY ||
    app.authToken ||
    env.ANTHROPIC_AUTH_TOKEN ||
    env.ANTHROPIC_API_KEY ||
    "";

  const claudeModels = {
    opus: env.ANTHROPIC_DEFAULT_OPUS_MODEL || "claude-opus-4-20250514",
    sonnet: env.ANTHROPIC_DEFAULT_SONNET_MODEL || "claude-sonnet-4-20250514",
    haiku: env.ANTHROPIC_DEFAULT_HAIKU_MODEL || "claude-3-5-haiku-20241022",
  };

  // App 配置了具体模型名 → 所有档位都用它（本 App 只跑一个模型，行为一致）。
  const claudeTier = (settings.model || "sonnet").toLowerCase();
  const claudeDefault = claudeModels[claudeTier] || claudeModels.sonnet;
  const usingAppModel = !!app.model;
  const defaultModel = app.model || claudeDefault;
  const models = usingAppModel
    ? { opus: app.model, sonnet: app.model, haiku: app.model }
    : claudeModels;

  const source = appActive
    ? APP_MODEL_PATH
    : fs.existsSync(SETTINGS_PATH)
    ? SETTINGS_PATH
    : "(defaults)";

  return {
    baseURL: baseURL.replace(/\/+$/, ""),
    authToken,
    models,
    tier: usingAppModel ? "app" : claudeTier,
    defaultModel,
    source,
    usingApp: appActive,
  };
}

// 用一份临时的显式配置构建 cfg（供"保存前测试"用，不落盘、不读文件）。
export function configFromOverride({ baseURL, authToken, model } = {}) {
  const m = String(model || "").trim();
  return {
    baseURL: String(baseURL || "").trim().replace(/\/+$/, "") || "https://api.anthropic.com",
    authToken: String(authToken || "").trim(),
    models: { opus: m, sonnet: m, haiku: m },
    tier: "app",
    defaultModel: m,
    source: "(test)",
    usingApp: true,
  };
}

export function maskToken(token) {
  if (!token) return "(none)";
  if (token.length <= 8) return token;
  return `${token.slice(0, 4)}…${token.slice(-2)}`;
}

// 一张 24×24 纯红(crimson, rgb 220,20,60) PNG，用于真实探测上游模型的视觉能力：
// 发给模型问"这是什么颜色"，能看图的会答红色，看不到的会说无法查看图片。
const VISION_PROBE_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAABgAAAAYCAIAAABvFaqvAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAJUlEQVR4nGO4I2JDFcQwatCdUYPujBokMmqQyKhBNqMG2QykQQC6QaMffcTGjwAAAABJRU5ErkJggg==";

// 基于模型名的视觉能力启发式：明确的视觉模型→true，明确的非对话/纯文本模型→false，未知→null。
// 仅作真实探测不可用时的兜底；能力判定应尽量以 probeVision() 的真实结果为准。
const VISION_MODEL_RE =
  /(gpt-4o|gpt-4\.1|gpt-4-turbo|gpt-4-vision|chatgpt-4o|claude-3|claude-4|claude-opus-[4-9]|claude-sonnet-[4-9]|claude-haiku-[4-9]|gemini|gemma-3|[-_/]vl\b|[-_]vl-|vision|internvl|llava|pixtral|glm-4v|glm-4\.1v|cogvlm|minicpm-v|yi-vl|step-1v|grok-[2-9]|doubao[-\w]*vision|llama-3\.[2-9][-\w]*vision|mistral-small-3|kimi-vl|ernie[-\w]*vl|molmo|phi-3\.5-vision|phi-4-multimodal|qwen[\d.]*-vl|qwen-vl|nova-(?:lite|pro)|reka)/i;
const NON_VISION_MODEL_RE = /(text-embedding|embedding|whisper|[-_/]tts|rerank|moderation)/i;

// 导出为纯函数，便于单测与离线兜底
export function guessVisionSupport(modelName) {
  const s = String(modelName || "").toLowerCase();
  if (!s) return null;
  if (NON_VISION_MODEL_RE.test(s)) return false;
  if (VISION_MODEL_RE.test(s)) return true;
  return null;
}

// 从 Anthropic messages 响应中提取纯文本（忽略 thinking 块）
function extractText(data) {
  if (!data || !Array.isArray(data.content)) return "";
  return data.content
    .filter((b) => b && b.type === "text" && typeof b.text === "string")
    .map((b) => b.text)
    .join("")
    .trim();
}

export class LLMProvider {
  constructor(cfg = resolveConfig()) {
    this.cfg = cfg;
  }

  get endpoint() {
    return `${this.cfg.baseURL}/v1/messages`;
  }

  // 底层对话接口
  async chat({
    system,
    messages,
    model,
    maxTokens = 4096,
    temperature,
    timeoutMs = 120000,
  }) {
    const body = {
      model: model || this.cfg.defaultModel,
      max_tokens: maxTokens,
      messages,
    };
    if (system) body.system = system;
    if (typeof temperature === "number") body.temperature = temperature;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res;
    try {
      res = await fetch(this.endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "anthropic-version": ANTHROPIC_VERSION,
          authorization: `Bearer ${this.cfg.authToken}`,
          "x-api-key": this.cfg.authToken,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timer);
      if (err.name === "AbortError") {
        throw new Error(`LLM 请求超时（${timeoutMs}ms）：${this.endpoint}`);
      }
      throw new Error(`无法连接 LLM 端点 ${this.endpoint}：${err.message}`);
    }
    clearTimeout(timer);

    const rawText = await res.text();
    if (!res.ok) {
      throw new Error(`LLM 返回 ${res.status}：${rawText.slice(0, 400)}`);
    }
    let data;
    try {
      data = JSON.parse(rawText);
    } catch {
      throw new Error(`LLM 响应非 JSON：${rawText.slice(0, 400)}`);
    }
    return { text: extractText(data), usage: data.usage, model: data.model, raw: data };
  }

  // 便捷：单轮文本补全
  async complete(prompt, opts = {}) {
    const { text } = await this.chat({
      system: opts.system,
      messages: [{ role: "user", content: prompt }],
      model: opts.model,
      maxTokens: opts.maxTokens,
      temperature: opts.temperature,
      timeoutMs: opts.timeoutMs,
    });
    return text;
  }

  // 探测真实上游模型：请求里我们发的是配置的模型 ID（如 claude-opus-4-8[1M]），
  // 但响应的 model 字段会返回实际服务的上游模型（如 mimo-v2.5-pro）。
  async probeModel() {
    try {
      const r = await this.chat({
        messages: [{ role: "user", content: "ok" }],
        model: this.cfg.defaultModel,
        maxTokens: 16,
        timeoutMs: 30000,
      });
      return { ok: true, tier: this.cfg.tier, configured: this.cfg.defaultModel, real: r.model || null };
    } catch (err) {
      return { ok: false, error: err.message, tier: this.cfg.tier, configured: this.cfg.defaultModel, real: null };
    }
  }

  // 真实探测上游模型是否具备视觉能力：发一张纯红图并要求用一个词描述颜色。
  // 返回 { supported: true|false|null, source: "probe"|"heuristic"|"unknown", reply, real, detail }
  async probeVision({ timeoutMs = 30000 } = {}) {
    const model = this.cfg.defaultModel;
    try {
      const r = await this.chat({
        model,
        maxTokens: 256,
        timeoutMs,
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: "image/png", data: VISION_PROBE_PNG } },
              { type: "text", text: "What is the dominant color of this image? Answer with a single English color word only." },
            ],
          },
        ],
      });
      const real = r.model || null;
      const textPart = (r.text || "").trim();
      // 推理型模型常把"看不到图/图片不受支持"写在 thinking 块里，一并纳入判据
      const thinkPart = Array.isArray(r.raw?.content)
        ? r.raw.content
            .filter((b) => b && b.type === "thinking" && typeof b.thinking === "string")
            .map((b) => b.thinking)
            .join(" ")
            .trim()
        : "";
      const combined = `${textPart} ${thinkPart}`.trim();
      const low = combined.toLowerCase();
      const replyOut = (textPart || (thinkPart ? `[思考] ${thinkPart}` : "")).slice(0, 180);

      // 1) 最终答案命中红色系 → 确认能看图（最可靠）
      if (/\b(red|crimson|scarlet|maroon|pink|rose|magenta|ruby|cherry)\b/.test(textPart.toLowerCase()) || /红|洋红|品红|粉|绯|玫/.test(textPart)) {
        return { supported: true, source: "probe", reply: replyOut, real };
      }
      // 2) 文本/思考中明确表示看不到图或图片不受支持 → 确认无视觉
      if (
        /unsupported|not\s+support|cannot see|can'?t see|can'?t view|unable to (?:see|view|process)|no image|don'?t see|do not see|not able to (?:see|view)|text[- ]?based|as an ai/.test(low) ||
        /看不到|无法(?:查看|识别|看到|处理)|不支持.*图|没有.*图片|无法.*图/.test(combined)
      ) {
        return { supported: false, source: "probe", reply: replyOut, real };
      }
      // 3) 答了明确但错误的颜色（探测图为红）→ 说明看不到图、在猜 → 无视觉
      if (/\b(blue|green|yellow|black|white|gr[ae]y|orange|brown|cyan|teal|violet|purple|gold|silver|indigo|navy)\b/.test(textPart.toLowerCase())) {
        return {
          supported: false,
          source: "probe",
          reply: replyOut,
          real,
          detail: `模型答"${textPart.slice(0, 24)}"，与探测图实际的红色不符，判定为看不到图片、在猜测`,
        };
      }
      // 4) 思考中出现红色 → 视为能看图
      if (/\b(red|crimson|scarlet|magenta|pink)\b/.test(low) || /红/.test(combined)) {
        return { supported: true, source: "probe", reply: replyOut, real };
      }
      // 5) 不确定 → 回退到真实模型名的启发式
      const g = guessVisionSupport(real);
      return { supported: g, source: g == null ? "unknown" : "heuristic", reply: replyOut, real };
    } catch (err) {
      const msg = String(err.message || "");
      // 端点明确因图片/多模态不受支持而报错 → 判定无视觉
      if (/40\d|41\d|42\d/.test(msg) && /image|vision|multimodal|not support|unsupported|invalid|content/i.test(msg)) {
        return { supported: false, source: "probe", detail: msg.slice(0, 160) };
      }
      // 其它错误（超时/连接/鉴权）→ 回退到配置模型名的启发式
      const g = guessVisionSupport(model);
      return { supported: g, source: g == null ? "unknown" : "heuristic", detail: msg.slice(0, 160) };
    }
  }

  // 综合探测：连通状态 + 配置/真实模型 + 视觉能力。供画廊 /api/model 展示。
  async inspect({ vision = true, timeoutMs = 30000 } = {}) {
    const base = await this.probeModel();
    let visionInfo;
    if (vision && base.ok) {
      visionInfo = await this.probeVision({ timeoutMs });
      if (visionInfo.real && !base.real) base.real = visionInfo.real;
    } else {
      const g = guessVisionSupport(base.real || base.configured);
      visionInfo = { supported: g, source: base.ok ? "unknown" : "offline-heuristic" };
    }
    return {
      ok: base.ok,
      error: base.error || null,
      tier: base.tier,
      configured: base.configured,
      real: base.real,
      endpoint: this.endpoint,
      configSource: this.cfg.source,
      vision: {
        supported: visionInfo.supported,
        source: visionInfo.source,
        reply: visionInfo.reply || null,
        detail: visionInfo.detail || null,
      },
    };
  }

  // 连通性自检
  async health() {
    try {
      const t = await this.complete("只回复两个字：可用", {
        model: this.cfg.models.haiku,
        maxTokens: 64,
        timeoutMs: 30000,
      });
      return { ok: true, reply: t };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }
}
