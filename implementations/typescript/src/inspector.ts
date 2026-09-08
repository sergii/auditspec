import { hardenAssessmentAcrossPaths } from "./all-path-assurance.js";
import { buildAssuranceGraph } from "./assurance-graph.js";
import { inspectRepository as inspectRepositoryBase } from "./inspect.js";
import type { AssessmentReport } from "./assessment-types.js";

export interface InspectionBundle {
  assessment: AssessmentReport;
  graph: Awaited<ReturnType<typeof buildAssuranceGraph>>;
}

export async function inspectRepositoryWithGraph(inputPath: string): Promise<InspectionBundle> {
  const [assessment, graph] = await Promise.all([
    inspectRepositoryBase(inputPath),
    buildAssuranceGraph(inputPath),
  ]);
  return {
    assessment: hardenAssessmentAcrossPaths(assessment, graph),
    graph,
  };
}

export async function inspectRepository(inputPath: string): Promise<AssessmentReport> {
  return (await inspectRepositoryWithGraph(inputPath)).assessment;
}
