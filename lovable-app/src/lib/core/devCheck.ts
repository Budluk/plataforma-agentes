// Static check of Python code written by the LLM. The code is never executed.
// The original used Python's `ast`; this runtime has no Python, so the same rules run over a
// Python tokenizer. Syntax validation is limited to brackets, strings and indentation tokens.

export const MAX_CHARS = 8000;
export const MAX_CODE_CHARS = MAX_CHARS;
export const MAX_EXPLANATION_CHARS = 600;
export const MAX_TASK_CHARS = 500;
/** The dev area asks for more room in its own call so code up to MAX_LINES is not cut. */
export const DEV_MAX_TOKENS = 6000;
export const MAX_LINES = 250;
const MAX_FINDINGS = 20;
const FORBIDDEN_NAMES = new Set([
  "eval", "exec", "compile", "__import__", "open", "input", "breakpoint", "globals", "locals", "vars", "getattr",
  "setattr", "delattr", "exit", "quit", "help",
]);
const ALLOWED_DUNDER_NAMES = new Set(["__name__", "__all__"]);
const ALLOWED_DUNDER_ATTRS = new Set(["__init__", "__name__"]);
const FORBIDDEN_ATTRS = new Set([
  "f_globals", "f_locals", "f_back", "f_builtins", "gi_frame", "gi_code", "cr_frame", "cr_code", "ag_frame", "tb_frame",
  "tb_next", "mro",
]);
const FORMAT_TRICK = /\{[^{}]*__[^{}]*\}/;
const KEYWORDS = new Set([
  "False", "None", "True", "and", "as", "assert", "async", "await", "break", "class", "continue", "def", "del", "elif",
  "else", "except", "finally", "for", "from", "global", "if", "import", "in", "is", "lambda", "nonlocal", "not", "or",
  "pass", "raise", "return", "try", "while", "with", "yield",
]);

const isDunder = (n: string) => n.length > 4 && n.startsWith("__") && n.endsWith("__");

export interface Report {
  ok: boolean;
  findings: string[];
  warnings: string[];
  metrics: Record<string, unknown>;
}

type Tok = { t: "name" | "op" | "str" | "num" | "nl"; v: string; line: number; fstr?: boolean };
/** Out-of-range sentinel: behaves like an end of line. */
const NONE: Tok = { t: "nl", v: "", line: 0 };

class SyntaxErr extends Error {
  constructor(public line: number) {
    super("syntax");
  }
}

function tokenize(code: string): Tok[] {
  const toks: Tok[] = [];
  let i = 0;
  let line = 1;
  const stack: string[] = [];
  const pairs: Record<string, string> = { ")": "(", "]": "[", "}": "{" };
  while (i < code.length) {
    const c = code[i];
    if (c === "\n") {
      if (!stack.length) toks.push({ t: "nl", v: "\n", line });
      line++;
      i++;
      continue;
    }
    if (c === "\\" && code[i + 1] === "\n") {
      i += 2;
      line++;
      continue;
    }
    if (c === " " || c === "\t" || c === "\r" || c === "\f") {
      i++;
      continue;
    }
    if (c === "#") {
      while (i < code.length && code[i] !== "\n") i++;
      continue;
    }
    const sm = /^([rRbBuUfF]{0,2})('''|"""|'|")/.exec(code.slice(i, i + 5));
    if (sm && sm[2] && (sm[1] === "" || /^(r|b|u|f|rb|br|fr|rf)$/i.test(sm[1] ?? ""))) {
      const prefix = (sm[1] ?? "").toLowerCase();
      const q = sm[2];
      const startLine = line;
      let j = i + sm[0].length;
      let body = "";
      for (;;) {
        if (j >= code.length) throw new SyntaxErr(startLine);
        if (code.startsWith(q, j)) {
          j += q.length;
          break;
        }
        const ch = code[j];
        if (ch === "\n") {
          if (q.length === 1) throw new SyntaxErr(startLine);
          line++;
        }
        if (ch === "\\" && !prefix.includes("r")) {
          body += code.slice(j, j + 2);
          if (code[j + 1] === "\n") line++;
          j += 2;
          continue;
        }
        body += ch;
        j++;
      }
      toks.push({ t: "str", v: body, line: startLine, fstr: prefix.includes("f") });
      i = j;
      continue;
    }
    const nm = /^[A-Za-z_\u00c0-\uffff][A-Za-z0-9_\u00c0-\uffff]*/.exec(code.slice(i, i + 200));
    if (nm) {
      toks.push({ t: "name", v: nm[0], line });
      i += nm[0].length;
      continue;
    }
    const num = /^(?:0[xX][0-9a-fA-F_]+|0[bB][01_]+|0[oO][0-7_]+|(?:\d[\d_]*\.?[\d_]*|\.\d[\d_]*)(?:[eE][+-]?\d+)?[jJ]?)/.exec(code.slice(i, i + 100));
    if (num && num[0]) {
      toks.push({ t: "num", v: num[0], line });
      i += num[0].length;
      continue;
    }
    const op = /^(?:\*\*=|\/\/=|>>=|<<=|->|:=|==|!=|<=|>=|\*\*|\/\/|<<|>>|[-+*/%&|^@]=|\.\.\.|[()[\]{}:;,.=<>+\-*/%&|^~@!])/.exec(code.slice(i, i + 4));
    if (op) {
      const v = op[0];
      if (v === "(" || v === "[" || v === "{") stack.push(v);
      else if (v === ")" || v === "]" || v === "}") {
        if (stack.pop() !== pairs[v]) throw new SyntaxErr(line);
      }
      toks.push({ t: "op", v, line });
      i += v.length;
      continue;
    }
    throw new SyntaxErr(line);
  }
  if (stack.length) throw new SyntaxErr(line);
  toks.push({ t: "nl", v: "\n", line });
  return toks;
}

function fExpressions(body: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (depth === 0 && ch === "{" && body[i + 1] === "{") {
      i++;
      continue;
    }
    if (ch === "{") {
      if (depth > 0) cur += ch;
      depth++;
      continue;
    }
    if (ch === "}" && depth > 0) {
      depth--;
      if (depth === 0) {
        out.push(cur.replace(/![rsa]$/, "").split(/:(?![^[]*\])/)[0] ?? "");
        cur = "";
      } else cur += ch;
      continue;
    }
    if (depth > 0) cur += ch;
  }
  return out;
}

export function analyzeSource(code: string, allowedImports: Iterable<string>): Report {
  const allowed = new Set(allowedImports);
  const fail = (msg: string): Report => ({ ok: false, findings: [msg], warnings: [], metrics: {} });
  if (!code.trim()) return fail("código vazio");
  if (code.includes("\x00")) return fail("código contém byte nulo");
  if (code.length > MAX_CHARS) return fail(`código excede ${MAX_CHARS} caracteres`);
  const lines = code.split("\n").length;
  if (lines > MAX_LINES) return fail(`código excede ${MAX_LINES} linhas`);

  const findings: string[] = [];
  const warnings: string[] = [];
  const imports = new Set<string>();
  let funcs = 0;
  let classes = 0;
  let mainGuard = false;
  const add = (msg: string, line?: number) => findings.push(line ? `${msg} (linha ${line})` : msg);

  const scanTokens = (toks: Tok[], lineOffset: number) => {
    const tok = (j: number): Tok => toks[j] ?? NONE;
    let parenDepth = 0;
    let inDefSig = false;
    let defSigDepth = 0;
    let stmtStart = true;
    for (let k = 0; k < toks.length; k++) {
      const tk = tok(k);
      const ln = tk.line + lineOffset;
      const prev = tok(k - 1);
      const next = tok(k + 1);
      if (tk.t === "nl") {
        stmtStart = true;
        continue;
      }
      const atStart = stmtStart;
      stmtStart = tk.t === "op" && (tk.v === ";" || (tk.v === ":" && parenDepth === 0 && !inDefSig));
      if (tk.t === "op") {
        if ("([{".includes(tk.v)) parenDepth++;
        if (")]}".includes(tk.v)) {
          parenDepth--;
          if (inDefSig && parenDepth < defSigDepth) inDefSig = false;
        }
        if (inDefSig && tk.v === "=" && parenDepth === defSigDepth && next && next.t === "op" && (next.v === "[" || next.v === "{"))
          warnings.push(`argumento padrão mutável em '${defName}' (linha ${ln})`);
        continue;
      }
      if (tk.t === "str") {
        if (FORMAT_TRICK.test(tk.v) && !tk.fstr) add("string de formatação com '__' não permitida", ln);
        if (tk.fstr) {
          const lits = tk.v.replace(/\{[^{}]*\}/g, "");
          if (FORMAT_TRICK.test(lits)) add("string de formatação com '__' não permitida", ln);
          for (const expr of fExpressions(tk.v)) {
            try {
              scanTokens(tokenize(expr), tk.line - 1 + lineOffset);
            } catch {
              add("sintaxe inválida", ln);
            }
          }
        }
        continue;
      }
      if (tk.t !== "name") continue;
      const v = tk.v;
      if (atStart && v === "import") {
        let j = k + 1;
        while (j < toks.length && tok(j).t !== "nl" && !(tok(j).t === "op" && tok(j).v === ";")) {
          if (tok(j).t === "name") {
            let mod = tok(j).v;
            while (tok(j + 1).v === "." && tok(j + 2).t === "name") {
              mod += "." + tok(j + 2).v;
              j += 2;
            }
            const top = mod.split(".")[0] ?? "";
            imports.add(top);
            if (!allowed.has(top)) add(`import não permitido: ${mod}`, ln);
            if (tok(j + 1).v === "as") j += 2;
          }
          j++;
        }
        k = j - 1;
        continue;
      }
      if (atStart && v === "from") {
        let j = k + 1;
        let level = 0;
        while (tok(j).t === "op" && (tok(j).v === "." || tok(j).v === "...")) {
          level += tok(j).v.length;
          j++;
        }
        let mod = "";
        if (tok(j).t === "name" && tok(j).v !== "import") {
          mod = tok(j).v;
          while (tok(j + 1).v === "." && tok(j + 2).t === "name") {
            mod += "." + tok(j + 2).v;
            j += 2;
          }
          j++;
        }
        if (level > 0) add("import relativo não permitido", ln);
        else {
          const top = mod.split(".")[0] ?? "";
          imports.add(top);
          if (!allowed.has(top)) add(`import não permitido: ${mod}`, ln);
        }
        while (j < toks.length && tok(j).t !== "nl" && !(tok(j).t === "op" && tok(j).v === ";")) {
          if (tok(j).t === "op" && tok(j).v === "*") add("import com * não permitido", ln);
          j++;
        }
        k = j - 1;
        continue;
      }
      if (KEYWORDS.has(v)) {
        if (v === "def") {
          funcs++;
          defName = next?.v ?? "";
          k++;
          inDefSig = true;
          defSigDepth = parenDepth + 1;
        } else if (v === "class") {
          classes++;
          k++;
        } else if (v === "except" && next?.t === "op" && next.v === ":") {
          warnings.push(`'except:' sem tipo (linha ${ln})`);
        } else if (v === "while" && next?.v === "True" && tok(k + 2).v === ":") {
          whileTrue.push(ln);
        }
        continue;
      }
      if (prev?.t === "op" && prev.v === "." && !(tok(k - 2).t === "op" && tok(k - 2).v === ".")) {
        if ((isDunder(v) && !ALLOWED_DUNDER_ATTRS.has(v)) || FORBIDDEN_ATTRS.has(v)) add(`acesso ao atributo '${v}' não permitido`, ln);
        continue;
      }
      // keyword arguments and parameter names are not Name nodes
      if (parenDepth > 0 && next?.t === "op" && next.v === "=") continue;
      if (inDefSig && prev?.t === "op" && ["(", ",", "*", "**"].includes(prev.v)) continue;
      if (FORBIDDEN_NAMES.has(v)) add(`uso de '${v}' não permitido`, ln);
      else if (isDunder(v) && !ALLOWED_DUNDER_NAMES.has(v)) add(`uso do nome '${v}' não permitido`, ln);
      if (v === "__name__" && next?.t === "op" && ["==", "!=", "<", ">", "<=", ">="].includes(next.v)) mainGuard = true;
      if (v === "__name__" && next?.t === "name" && (next.v === "in" || next.v === "is" || next.v === "not")) mainGuard = true;
    }
  };

  let defName = "";
  const whileTrue: number[] = [];
  let toks: Tok[];
  try {
    toks = tokenize(code);
  } catch (e) {
    if (e instanceof SyntaxErr) return fail(`sintaxe inválida (linha ${e.line})`);
    return fail("código não pôde ser analisado (estrutura inválida ou profunda demais)");
  }
  scanTokens(toks, 0);

  const srcLines = code.split("\n");
  const indentOf = (s: string) => s.length - s.trimStart().length;
  for (const ln of whileTrue) {
    const base = indentOf(srcLines[ln - 1] ?? "");
    let hasBreak = false;
    for (let i = ln; i < srcLines.length; i++) {
      const s = srcLines[i] ?? "";
      if (!s.trim() || s.trim().startsWith("#")) continue;
      if (indentOf(s) <= base) break;
      if (/\bbreak\b/.test(s.replace(/#.*$/, ""))) hasBreak = true;
    }
    if (!hasBreak) warnings.push(`'while True' sem 'break' (linha ${ln})`);
  }

  const uniqFindings = [...new Set(findings)].slice(0, MAX_FINDINGS);
  return {
    ok: uniqFindings.length === 0,
    findings: uniqFindings,
    warnings: [...new Set(warnings)],
    metrics: { lines, functions: funcs, classes, imports: [...imports].sort(), has_main_guard: mainGuard },
  };
}

export const SAFE_NAME = /^[A-Za-z0-9_-]{1,40}\.py$/;
export const RESERVED = new Set(["con", "prn", "aux", "nul", ...Array.from({ length: 9 }, (_, i) => `com${i + 1}`), ...Array.from({ length: 9 }, (_, i) => `lpt${i + 1}`)]);
export const CODE_HEADER = "# GERADO POR LLM. NAO EXECUTADO PELA PLATAFORMA.\n# Leia e revise tudo antes de rodar, de preferencia em ambiente isolado.\n";
