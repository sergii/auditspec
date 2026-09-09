export interface AssuranceSourceScope {
  id: string;
  name: string;
  qualified_name: string;
  kind: "function" | "method";
  start_line: number;
  start_column: number;
  end_line: number;
  end_column: number;
}

export interface AssuranceSourceCall {
  text: string;
  callee: string;
  method: string;
  line: number;
  column: number;
  scope?: AssuranceSourceScope;
}

export interface AssuranceSourceScan {
  parsed: boolean;
  calls: AssuranceSourceCall[];
}

export interface AssuranceSourceLanguagePlugin {
  id: string;
  language: string;
  matches(path: string): boolean;
  scan(source: string, path: string): AssuranceSourceScan;
}
