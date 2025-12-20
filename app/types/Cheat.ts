// static

import { sha256 } from "js-sha256";

let isCheatEnabled = false;

function enableCheat() {
  isCheatEnabled = true;
}

function isCheatReally(): boolean {
  return isCheatEnabled;
}

function isCheat(): boolean {
  if (Math.random() < 0.5) { return false; }
  return isCheatEnabled;
}

function glitchString(input: string): string {
  const glitchChars = ['#', '%', '&', '*', '@', '!', '?', '$', ' '];
  const count = Math.floor(input.length / 4);
  let result = "";
  for (let i = 0; i < input.length; i++) {
    const uppercase = Math.random() < 0.5;
    if (uppercase) {
      result += input[i].toUpperCase();
    } else {
      result += input[i].toLowerCase();
    }
  }
  for (let i = 0; i < count; i++) {
    const pos = Math.floor(Math.random() * result.length);
    const glitchChar = glitchChars[Math.floor(Math.random() * glitchChars.length)];
    result = result.slice(0, pos) + glitchChar + result.slice(pos);
  }
  return result;
}

const cheaterStrings = [
  "cheater",
]

function hsvToRgb(h: number, s: number, v: number): { r: number; g: number; b: number } {
  let r: number, g: number, b: number;
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  switch (i % 6) {
    case 0:
      r = v; g = t; b = p;
      break;
    case 1:
      r = q; g = v; b = p;
      break;
    case 2:
      r = p; g = v; b = t;
      break;
    case 3:
      r = p; g = q; b = v;
      break;
    case 4:
      r = t; g = p; b = v;
      break;
    case 5:
      r = v; g = p; b = q;
      break;
    default:
      r = 0; g = 0; b = 0;
  }
  return { r, g, b };
}

function randomColor(s: number, v: number): string {
  const h = Math.random();
  const p = hsvToRgb(h, s, v);
  return `rgb(${Math.floor(p.r * 255)}, ${Math.floor(p.g * 255)}, ${Math.floor(p.b * 255)})`;
}

function getGlitchCheat(isCheat?: boolean, original?: string): string {
  if (isCheat) {
    const r = cheaterStrings[Math.floor(Math.random() * cheaterStrings.length)];
    const repeats = Math.floor((original?.length ?? 1) / r.length);
    const concat = (r.repeat(repeats) + r.slice(0, (original?.length ?? 1) % r.length)).slice(0, Math.ceil((original?.length ?? 1) * 0.8));
    return glitchString(concat);
  }
  return original || "";
}

function cheatSanitize(input?: string): string {
  if (isCheat()) {
    return getGlitchCheat(true, input);
  }
  return input || "";
}

const validCheatSHA256s = new Set<string>([
  "9e17e6f09b43129226573cb2967ee7293becf81c796ea7df7402b216a60ae297",
]);

function isCheatString(input: string): boolean {
  const hashed = sha256(input);
  return validCheatSHA256s.has(hashed);
}

export { glitchString, hsvToRgb, randomColor, getGlitchCheat, enableCheat, isCheat, isCheatReally, cheatSanitize, isCheatString };