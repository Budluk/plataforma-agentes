import { describe, it, expect } from "vitest";
import {
  evaluateConditions,
  evaluateCondition,
  evaluateAutomationKillSwitch,
  type WorkflowCondition,
} from "@/lib/core/automacoes";

describe("evaluateConditions — operadores de condição", () => {
  const data = { score: 85, status: "qualificado", tags: ["vip"] };

  it("maior_que", () => {
    const r = evaluateConditions(
      [{ field: "score", op: "maior_que", value: 70 }],
      data,
    );
    expect(r.status).toBe("medido");
    expect(r.passed).toBe(true);
    expect(r.evaluated).toBe(1);
    expect(r.matched).toBe(1);
  });

  it("contem", () => {
    const r = evaluateConditions(
      [{ field: "tags", op: "contem", value: "vip" }],
      data,
    );
    expect(r.passed).toBe(true);
  });

  it("nao_contem", () => {
    const r = evaluateConditions(
      [{ field: "tags", op: "nao_contem", value: "spam" }],
      data,
    );
    expect(r.passed).toBe(true);
  });

  it("invalido quando condição falha", () => {
    const r = evaluateConditions(
      [{ field: "score", op: "menor_que", value: 10 }],
      data,
    );
    expect(r.passed).toBe(false);
  });

  it("modo qualquer basta uma condição", () => {
    const r = evaluateConditions(
      [
        { field: "score", op: "maior_que", value: 900 },
        { field: "status", op: "igual", value: "qualificado" },
      ],
      data,
      "qualquer",
    );
    expect(r.passed).toBe(true);
  });

  it("condição ausente falha fechado", () => {
    const r = evaluateConditions(
      [{ field: "inexistente", op: "igual", value: "x" }],
      data,
    );
    expect(r.passed).toBe(false);
    expect(r.status).toBe("sem_dados");
  });
});

describe("evaluateCondition — condição individual", () => {
  const data = { idade: 30, ativo: true };

  it("igual", () => {
    const r = evaluateCondition({ field: "ativo", op: "igual", value: true }, data);
    expect(r.passed).toBe(true);
  });

  it("maior_ou_igual", () => {
    const r = evaluateCondition({ field: "idade", op: "maior_ou_igual", value: 18 }, data);
    expect(r.passed).toBe(true);
  });

  it("existe", () => {
    const r = evaluateCondition({ field: "idade", op: "existe" }, data);
    expect(r.passed).toBe(true);
  });

  it("nao_existe", () => {
    const r = evaluateCondition({ field: "telefone", op: "nao_existe" }, data);
    expect(r.passed).toBe(true);
  });
});

describe("evaluateAutomationKillSwitch", () => {
  it("engajado bloqueia tudo", () => {
    const r = evaluateAutomationKillSwitch(true);
    expect(r.halted).toBe(true);
    expect(r.reason).toContain("kill switch");
  });

  it("desengajado permite", () => {
    const r = evaluateAutomationKillSwitch(false);
    expect(r.halted).toBe(false);
  });
});
