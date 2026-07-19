import OpenAI from 'openai';
import { z } from 'zod';
import type { Config } from '../config.js';
import { ApiError } from '../errors.js';
import {
  buildOptimizationPolicyInput,
  OPTIMIZATION_POLICY_PROMPT_VERSION,
  OPTIMIZATION_POLICY_SYSTEM_PROMPT,
} from '../prompts/optimization-policy.js';

export const SnapshotSchema = z.object({
  generatedAt: z.string(), startLocationId: z.string(), merchantId: z.string(),
  shipper: z.object({ shipperId: z.string(), currentLatitude: z.number(), currentLongitude: z.number(), locationTimestamp: z.string() }),
  orders: z.array(z.object({ orderId: z.string(), buildingId: z.string(), status: z.enum(['READY', 'TEMP_WAITING_READY', 'REDELIVERY_NEXT']), readyAt: z.string().nullable(), minutesWaiting: z.number(), foodCategory: z.string(), freshnessRisk: z.enum(['LOW', 'MEDIUM', 'HIGH']), deliveryAttempt: z.union([z.literal(1), z.literal(2)]) })),
  buildings: z.array(z.object({ buildingId: z.string(), pickupLatitude: z.number(), pickupLongitude: z.number(), mapXRatio: z.number(), mapYRatio: z.number() })),
  remainingStops: z.array(z.object({ stopId: z.string(), buildingId: z.string(), status: z.string(), sequence: z.number(), temporarilyUnavailable: z.boolean() })),
  completedStopIds: z.array(z.string()), currentStopId: z.string().nullable(),
  travelTimeMatrix: z.record(z.string(), z.record(z.string(), z.number())),
});
export type OperationalSnapshot = z.infer<typeof SnapshotSchema>;
const PolicySchema = z.object({
  buildingPriorities: z.array(z.object({ buildingId: z.string(), priorityScore: z.number().min(0).max(100), reasons: z.array(z.string()).min(1).max(4) })),
  objectiveWeights: z.object({ travelTime: z.number().min(0).max(5), orderWaiting: z.number().min(0).max(5), freshnessRisk: z.number().min(0).max(5), buildingBatchValue: z.number().min(0).max(5), routeChangePenalty: z.number().min(0).max(5) }),
  hardConstraints: z.object({ preserveCurrentStop: z.literal(true), preserveCompletedStops: z.literal(true), includeEveryEligibleOrder: z.literal(true), excludeUnavailableBuildingIds: z.array(z.string()) }),
  explanation: z.array(z.string()).min(1).max(5), recommendationNeeded: z.boolean(),
});
export type OptimizationPolicy = z.infer<typeof PolicySchema>;

function fallbackPolicy(snapshot: OperationalSnapshot): OptimizationPolicy {
  const grouped = new Map<string, typeof snapshot.orders>();
  for (const order of snapshot.orders) grouped.set(order.buildingId, [...(grouped.get(order.buildingId) ?? []), order]);
  return {
    buildingPriorities: [...new Set(snapshot.remainingStops.map((stop) => stop.buildingId))].map((buildingId) => {
      const list = grouped.get(buildingId) ?? [];
      const retry = list.some((order) => order.deliveryAttempt === 2 || order.status !== 'READY');
      const maximumWait = Math.max(...list.map((order) => order.minutesWaiting), 0);
      const maximumRisk = Math.max(...list.map((order) => ({ LOW: 10, MEDIUM: 25, HIGH: 45 }[order.freshnessRisk])), 0);
      return {
        buildingId,
        priorityScore: Math.min(100, (retry ? 30 : 0) + maximumWait * 1.5 + maximumRisk + list.length * 6),
        reasons: [
          ...(retry ? ['Có đơn giao lại lần hai'] : []),
          `${list.length} đơn được gom tại cùng tòa`,
          `Đã chờ tối đa ${Math.round(maximumWait)} phút; rủi ro độ tươi đã được tính`,
        ],
      };
    }),
    objectiveWeights: { travelTime: 1, orderWaiting: 1.2, freshnessRisk: 1.5, buildingBatchValue: .8, routeChangePenalty: 1.1 },
    hardConstraints: { preserveCurrentStop: true, preserveCompletedStops: true, includeEveryEligibleOrder: true, excludeUnavailableBuildingIds: snapshot.remainingStops.filter(s => s.temporarilyUnavailable).map(s => s.buildingId) },
    explanation: ['Deterministic fallback policy used; waiting, freshness, distance and batch size remain represented.'], recommendationNeeded: true,
  };
}

export function validatePolicyAgainstSnapshot(
  snapshot: OperationalSnapshot,
  candidate: unknown,
): OptimizationPolicy {
  const policy = PolicySchema.parse(candidate);
  const expectedBuildingIds = [...new Set(snapshot.remainingStops.map((stop) => stop.buildingId))];
  const actualBuildingIds = policy.buildingPriorities.map((item) => item.buildingId);
  if (
    actualBuildingIds.length !== expectedBuildingIds.length ||
    new Set(actualBuildingIds).size !== actualBuildingIds.length ||
    expectedBuildingIds.some((buildingId) => !actualBuildingIds.includes(buildingId))
  )
    throw new Error('Policy must prioritize every candidate building exactly once');
  const expectedUnavailable = expectedBuildingIds
    .filter((buildingId) => snapshot.remainingStops.some((stop) => stop.buildingId === buildingId && stop.temporarilyUnavailable))
    .sort();
  const actualUnavailable = [...policy.hardConstraints.excludeUnavailableBuildingIds].sort();
  if (
    actualUnavailable.length !== expectedUnavailable.length ||
    actualUnavailable.some((buildingId, index) => buildingId !== expectedUnavailable[index])
  )
    throw new Error('Policy changed the authoritative unavailable-building set');
  return policy;
}

export async function createPolicy(config: Config, snapshot: OperationalSnapshot): Promise<{ policy: OptimizationPolicy; source: 'OPENAI' | 'FALLBACK'; promptVersion: string; warning?: string }> {
  SnapshotSchema.parse(snapshot);
  if (!config.openaiApiKey) return { policy: fallbackPolicy(snapshot), source: 'FALLBACK', promptVersion: OPTIMIZATION_POLICY_PROMPT_VERSION, warning: 'OpenAI unavailable; deterministic policy used.' };
  try {
    const client = new OpenAI({ apiKey: config.openaiApiKey, timeout: config.openaiTimeoutMs, maxRetries: 0 });
    const response = await client.responses.create({
      model: config.openaiModel,
      instructions: OPTIMIZATION_POLICY_SYSTEM_PROMPT,
      input: buildOptimizationPolicyInput(snapshot),
      text: { format: { type: 'json_schema', name: 'optimization_policy', strict: true, schema: {
        type:'object', additionalProperties:false, required:['buildingPriorities','objectiveWeights','hardConstraints','explanation','recommendationNeeded'], properties:{
          buildingPriorities:{type:'array',items:{type:'object',additionalProperties:false,required:['buildingId','priorityScore','reasons'],properties:{buildingId:{type:'string'},priorityScore:{type:'number',minimum:0,maximum:100},reasons:{type:'array',minItems:1,maxItems:4,items:{type:'string'}}}}},
          objectiveWeights:{type:'object',additionalProperties:false,required:['travelTime','orderWaiting','freshnessRisk','buildingBatchValue','routeChangePenalty'],properties:{travelTime:{type:'number',minimum:0,maximum:5},orderWaiting:{type:'number',minimum:0,maximum:5},freshnessRisk:{type:'number',minimum:0,maximum:5},buildingBatchValue:{type:'number',minimum:0,maximum:5},routeChangePenalty:{type:'number',minimum:0,maximum:5}}},
          hardConstraints:{type:'object',additionalProperties:false,required:['preserveCurrentStop','preserveCompletedStops','includeEveryEligibleOrder','excludeUnavailableBuildingIds'],properties:{preserveCurrentStop:{const:true},preserveCompletedStops:{const:true},includeEveryEligibleOrder:{const:true},excludeUnavailableBuildingIds:{type:'array',items:{type:'string'}}}},
          explanation:{type:'array',minItems:1,maxItems:5,items:{type:'string'}},recommendationNeeded:{type:'boolean'}
        }
      } } }
    });
    const policy = validatePolicyAgainstSnapshot(snapshot, JSON.parse(response.output_text));
    return { policy, source: 'OPENAI', promptVersion: OPTIMIZATION_POLICY_PROMPT_VERSION };
  } catch (error) {
    return { policy: fallbackPolicy(snapshot), source: 'FALLBACK', promptVersion: OPTIMIZATION_POLICY_PROMPT_VERSION, warning: `OpenAI policy failed; fallback used (${error instanceof Error ? error.name : 'unknown'}).` };
  }
}

export const SolverResultSchema = z.object({ status: z.enum(['FEASIBLE','INFEASIBLE','TIME_LIMIT']), orderedStopIds: z.array(z.string()), orderedBuildingIds: z.array(z.string()), estimatedTravelMinutes: z.number().nonnegative(), estimatedServiceMinutes: z.number().nonnegative(), objectiveScore: z.number() });
export type SolverResult = z.infer<typeof SolverResultSchema>;
function fallbackSolver(snapshot: OperationalSnapshot, policy: OptimizationPolicy): SolverResult {
  const priority = new Map(policy.buildingPriorities.map(x => [x.buildingId, x.priorityScore])); const unavailable = new Set(policy.hardConstraints.excludeUnavailableBuildingIds);
  const ordered = [...snapshot.remainingStops].sort((a,b) => Number(unavailable.has(a.buildingId))-Number(unavailable.has(b.buildingId)) || (priority.get(b.buildingId)??0)-(priority.get(a.buildingId)??0) || a.sequence-b.sequence);
  let travel=0; for(let i=0;i<ordered.length;i++) { const from=i===0?snapshot.startLocationId:ordered[i-1].buildingId; const leg=snapshot.travelTimeMatrix[from]?.[ordered[i].buildingId]; if(leg===undefined) throw new ApiError(500,'travel_matrix_incomplete',`Missing travel time ${from} -> ${ordered[i].buildingId}`); travel += leg; }
  return { status:'FEASIBLE', orderedStopIds:ordered.map(x=>x.stopId), orderedBuildingIds:ordered.map(x=>x.buildingId), estimatedTravelMinutes:travel, estimatedServiceMinutes:ordered.length*3, objectiveScore:travel };
}
export function validateSolverResult(snapshot: OperationalSnapshot, result: SolverResult) {
  if(result.status!=='FEASIBLE') throw new ApiError(503,'solver_failed',`Solver status ${result.status}`);
  const eligible=snapshot.remainingStops.map(s=>s.stopId);
  if((snapshot.currentStopId&&result.orderedStopIds.includes(snapshot.currentStopId))||result.orderedStopIds.some(id=>snapshot.completedStopIds.includes(id))) throw new ApiError(502,'invalid_solver_result','Current and completed stops are immutable');
  if(result.orderedStopIds.length!==eligible.length || new Set(result.orderedStopIds).size!==eligible.length || eligible.some(id=>!result.orderedStopIds.includes(id))) throw new ApiError(502,'invalid_solver_result','Solver must include each eligible stop exactly once');
  const stopMap=new Map(snapshot.remainingStops.map(s=>[s.stopId,s]));
  if(result.orderedStopIds.some((id,i)=>stopMap.get(id)?.buildingId!==result.orderedBuildingIds[i])) throw new ApiError(502,'invalid_solver_result','Solver stop/building sequence mismatch');
  return result;
}
export async function solveRoute(config:Config,snapshot:OperationalSnapshot,policy:OptimizationPolicy):Promise<{result:SolverResult;source:'ORTOOLS'|'FALLBACK';warning?:string}> {
  try {
    const response=await fetch(`${config.solverWorkerUrl}/solve`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({snapshot,policy,timeLimitSeconds:config.solverTimeLimitSeconds}),signal:AbortSignal.timeout((config.solverTimeLimitSeconds+3)*1000)});
    if(!response.ok) throw new Error(`worker ${response.status}`);
    return {result:validateSolverResult(snapshot,SolverResultSchema.parse(await response.json())),source:'ORTOOLS'};
  } catch(error) {
    console.warn(JSON.stringify({level:'warn',message:'Solver worker unavailable; deterministic route used',error:error instanceof Error?error.message:String(error),workerUrl:config.solverWorkerUrl}));
    return {result:validateSolverResult(snapshot,fallbackSolver(snapshot,policy)),source:'FALLBACK',warning:'Solver worker unavailable; deterministic feasible route used.'};
  }
}
