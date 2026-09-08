export interface FrappeStaticHookDispatch {
  assignment: "doc_events" | "scheduler_events";
  target: string;
  line: number;
}

type LiteralValue =
  | { kind: "string"; value: string; offset: number }
  | { kind: "list"; values: LiteralValue[] }
  | { kind: "dict"; entries: Array<{ key: LiteralValue; value: LiteralValue }> };

class LiteralParser {
  private index = 0;

  constructor(private readonly source: string, private readonly baseOffset: number) {}

  parse(): LiteralValue | null {
    this.skipTrivia();
    const value = this.parseValue();
    if (!value) return null;
    this.skipTrivia();
    return this.index === this.source.length ? value : null;
  }

  private parseValue(): LiteralValue | null {
    this.skipTrivia();
    const char = this.source[this.index];
    if (char === "'" || char === '"') return this.parseString();
    if (char === "[") return this.parseList("]");
    if (char === "(") return this.parseList(")");
    if (char === "{") return this.parseDict();
    return null;
  }

  private parseString(): LiteralValue | null {
    const quote = this.source[this.index]!;
    const start = this.index;
    this.index += 1;
    let value = "";

    while (this.index < this.source.length) {
      const char = this.source[this.index]!;
      if (char === "\\") return null;
      if (char === quote) {
        this.index += 1;
        return { kind: "string", value, offset: this.baseOffset + start };
      }
      if (char === "\n" || char === "\r") return null;
      value += char;
      this.index += 1;
    }
    return null;
  }

  private parseList(close: "]" | ")"): LiteralValue | null {
    this.index += 1;
    const values: LiteralValue[] = [];
    this.skipTrivia();
    if (this.source[this.index] === close) {
      this.index += 1;
      return { kind: "list", values };
    }

    while (this.index < this.source.length) {
      const value = this.parseValue();
      if (!value) return null;
      values.push(value);
      this.skipTrivia();
      const char = this.source[this.index];
      if (char === close) {
        this.index += 1;
        return { kind: "list", values };
      }
      if (char !== ",") return null;
      this.index += 1;
      this.skipTrivia();
      if (this.source[this.index] === close) {
        this.index += 1;
        return { kind: "list", values };
      }
    }
    return null;
  }

  private parseDict(): LiteralValue | null {
    this.index += 1;
    const entries: Array<{ key: LiteralValue; value: LiteralValue }> = [];
    this.skipTrivia();
    if (this.source[this.index] === "}") {
      this.index += 1;
      return { kind: "dict", entries };
    }

    while (this.index < this.source.length) {
      const key = this.parseValue();
      if (!key || key.kind !== "string") return null;
      this.skipTrivia();
      if (this.source[this.index] !== ":") return null;
      this.index += 1;
      const value = this.parseValue();
      if (!value) return null;
      entries.push({ key, value });
      this.skipTrivia();
      const char = this.source[this.index];
      if (char === "}") {
        this.index += 1;
        return { kind: "dict", entries };
      }
      if (char !== ",") return null;
      this.index += 1;
      this.skipTrivia();
      if (this.source[this.index] === "}") {
        this.index += 1;
        return { kind: "dict", entries };
      }
    }
    return null;
  }

  private skipTrivia(): void {
    while (this.index < this.source.length) {
      const char = this.source[this.index]!;
      if (/\s/.test(char)) {
        this.index += 1;
        continue;
      }
      if (char === "#") {
        while (this.index < this.source.length && this.source[this.index] !== "\n") this.index += 1;
        continue;
      }
      break;
    }
  }
}

function lineAt(source: string, offset: number): number {
  return source.slice(0, offset).split("\n").length;
}

function assignmentLiteral(source: string, name: string): LiteralValue | null {
  const assignment = new RegExp(`(?:^|\\n)\\s*${name}\\s*=\\s*`).exec(source);
  if (!assignment || assignment.index === undefined) return null;
  const start = assignment.index + assignment[0].length;
  const parser = new LiteralParser(source.slice(start), start);
  return parser.parse();
}

function dottedTarget(value: LiteralValue): value is Extract<LiteralValue, { kind: "string" }> {
  return value.kind === "string"
    && /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*){2,}$/.test(value.value);
}

function targetStrings(value: LiteralValue): Extract<LiteralValue, { kind: "string" }>[] | null {
  if (value.kind === "string") return dottedTarget(value) ? [value] : null;
  if (value.kind !== "list") return null;
  if (!value.values.every(dottedTarget)) return null;
  return value.values;
}

function docEventTargets(value: LiteralValue): Extract<LiteralValue, { kind: "string" }>[] | null {
  if (value.kind !== "dict") return null;
  const targets: Extract<LiteralValue, { kind: "string" }>[] = [];
  for (const doctype of value.entries) {
    if (doctype.value.kind !== "dict") return null;
    for (const event of doctype.value.entries) {
      const eventTargets = targetStrings(event.value);
      if (!eventTargets) return null;
      targets.push(...eventTargets);
    }
  }
  return targets;
}

function schedulerTargets(value: LiteralValue): Extract<LiteralValue, { kind: "string" }>[] | null {
  if (value.kind !== "dict") return null;
  const targets: Extract<LiteralValue, { kind: "string" }>[] = [];
  for (const event of value.entries) {
    if (event.key.kind !== "string") return null;
    if (event.key.value === "cron") {
      if (event.value.kind !== "dict") return null;
      for (const cron of event.value.entries) {
        const cronTargets = targetStrings(cron.value);
        if (!cronTargets) return null;
        targets.push(...cronTargets);
      }
      continue;
    }
    const eventTargets = targetStrings(event.value);
    if (!eventTargets) return null;
    targets.push(...eventTargets);
  }
  return targets;
}

export function frappeStaticHookDispatches(source: string): FrappeStaticHookDispatch[] {
  const dispatches: FrappeStaticHookDispatch[] = [];

  const docEvents = assignmentLiteral(source, "doc_events");
  if (docEvents) {
    const targets = docEventTargets(docEvents);
    if (targets) {
      dispatches.push(...targets.map((target) => ({
        assignment: "doc_events" as const,
        target: target.value,
        line: lineAt(source, target.offset),
      })));
    }
  }

  const schedulerEvents = assignmentLiteral(source, "scheduler_events");
  if (schedulerEvents) {
    const targets = schedulerTargets(schedulerEvents);
    if (targets) {
      dispatches.push(...targets.map((target) => ({
        assignment: "scheduler_events" as const,
        target: target.value,
        line: lineAt(source, target.offset),
      })));
    }
  }

  return dispatches;
}
