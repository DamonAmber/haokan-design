// 轻量彩色控制台日志
const C = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  magenta: "\x1b[35m",
  gray: "\x1b[90m",
};

let stepN = 0;

export const log = {
  step(msg) {
    stepN += 1;
    process.stdout.write(`\n${C.bold}${C.cyan}[${stepN}]${C.reset} ${C.bold}${msg}${C.reset}\n`);
  },
  info(msg) {
    process.stdout.write(`    ${msg}\n`);
  },
  detail(msg) {
    process.stdout.write(`    ${C.gray}${msg}${C.reset}\n`);
  },
  ok(msg) {
    process.stdout.write(`    ${C.green}✓${C.reset} ${msg}\n`);
  },
  warn(msg) {
    process.stdout.write(`    ${C.yellow}⚠${C.reset}  ${msg}\n`);
  },
  error(msg) {
    process.stdout.write(`    ${C.red}✗${C.reset} ${msg}\n`);
  },
  raw(msg) {
    process.stdout.write(`${msg}\n`);
  },
};

export const c = C;
