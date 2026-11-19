#!/usr/bin/env node
// Valida texto ASCII-only para titulo/body de PR.
//   node check-ascii.mjs "titulo do PR"
//   Get-Content body.txt -Raw | node check-ascii.mjs
// Exit codes: 0 = ASCII, 1 = contem nao-ASCII, 2 = sem entrada.

import { readFileSync } from "node:fs";

const fromArg = process.argv.slice(2).join(" ");
const fromStdin = process.stdin.isTTY ? "" : readFileSync(0, "utf8");
const text = (fromArg || fromStdin).trim();

if (!text) {
  console.error("Uso: node check-ascii.mjs <texto>   (ou pipe via stdin)");
  process.exit(2);
}

const bad = [];
for (const [pos, char] of [...text].entries()) {
  const cp = char.codePointAt(0);
  if (cp > 0x7f) {
    bad.push({ pos, char, code: `U+${cp.toString(16).toUpperCase().padStart(4, "0")}` });
  }
}

if (bad.length) {
  console.error(`NAO ASCII: ${bad.length} caractere(s). Corrija antes de criar o PR:`);
  for (const item of bad.slice(0, 20)) {
    console.error(`  pos ${item.pos}: ${item.char} (${item.code})`);
  }
  process.exit(1);
}

console.log("OK: texto ASCII-only.");
