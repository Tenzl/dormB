import OpenAI from 'openai';
import { z } from 'zod';
import type { Config } from '../config.js';
import { ApiError } from '../errors.js';

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
  buildingPriorities: z.array(z.object({ buildingId: z.string(), priorityScore: z.number().min(0).max(100), reasons: z.array(z.string()) })),
  objectiveWeights: z.object({ travelTime: z.number().nonnegative(), orderWaiting: z.number().nonnegative(), freshnessRisk: z.number().nonnegative(), buildingBatchValue: z.number().nonnegative(), routeChangePenalty: z.number().nonnegative() }),
  hardConstraints: z.object({ preserveCurrentStop: z.literal(true), preserveCompletedStops: z.literal(true), includeEveryEligibleOrder: z.literal(true), excludeUnavailableBuildingIds: z.array(z.string()) }),
  explanation: z.array(z.string()), recommendationNeeded: z.boolean(),
});
export type OptimizationPolicy = z.infer<typeof PolicySchema>;

function fallbackPolicy(snapshot: OperationalSnapshot): OptimizationPolicy {
  const grouped = new Map<string, typeof snapshot.orders>();
  for (const order of snapshot.orders) grouped.set(order.buildingId, [...(grouped.get(order.buildingId) ?? []), order]);
  return {
    buildingPriorities: [...grouped.entries()].map(([buildingId, list]) => ({ buildingId, priorityScore: Math.min(100, Math.max(...list.map(o => o.minutesWaiting), 0) * 1.5 + Math.max(...list.map(o => ({ LOW: 10, MEDIUM: 25, HIGH: 45 }[o.freshnessRisk]))) + list.length * 6), reasons: [`${list.length} grouped order(s)`, 'Waiting time and freshness risk considered'] })),
    objectiveWeights: { travelTime: 1, orderWaiting: 1.2, freshnessRisk: 1.5, buildingBatchValue: .8, routeChangePenalty: 1.1 },
    hardConstraints: { preserveCurrentStop: true, preserveCompletedStops: true, includeEveryEligibleOrder: true, excludeUnavailableBuildingIds: snapshot.remainingStops.filter(s => s.temporarilyUnavailable).map(s => s.buildingId) },
    explanation: ['Deterministic fallback policy used; waiting, freshness, distance and batch size remain represented.'], recommendationNeeded: true,
  };
}

export async function createPolicy(config: Config, snapshot: OperationalSnapshot): Promise<{ policy: OptimizationPolicy; source: 'OPENAI' | 'FALLBACK'; warning?: string }> {
  SnapshotSchema.parse(snapshot);
  if (!config.openaiApiKey) return { policy: fallbackPolicy(snapshot), source: 'FALLBACK', warning: 'OpenAI unavailable; deterministic policy used.' };
  try {
    const client = new OpenAI({ apiKey: config.openaiApiKey, timeout: config.openaiTimeoutMs, maxRetries: 0 });
    const response = await client.responses.create({
      model: config.openaiModel, instructions: 'Create optimization policy only. Never mutate state. Include only snapshot building IDs. Return strict JSON.', input: JSON.stringify(snapshot),
      text: { format: { type: 'json_schema', name: 'optimization_policy', strict: true, schema: {
        type:'object', additionalProperties:false, required:['buildingPriorities','objectiveWeights','hardConstraints','explanation','recommendationNeeded'], properties:{
          buildingPriorities:{type:'array',items:{type:'object',additionalProperties:false,required:['buildingId','priorityScore','reasons'],properties:{buildingId:{type:'string'},priorityScore:{type:'number'},reasons:{type:'array',items:{type:'string'}}}}},
          objectiveWeights:{type:'object',additionalProperties:false,required:['travelTime','orderWaiting','freshnessRisk','buildingBatchValue','routeChangePenalty'],properties:{travelTime:{type:'number'},orderWaiting:{type:'number'},freshnessRisk:{type:'number'},buildingBatchValue:{type:'number'},routeChangePenalty:{type:'number'}}},
          hardConstraints:{type:'object',additionalProperties:false,required:['preserveCurrentStop','preserveCompletedStops','includeEveryEligibleOrder','excludeUnavailableBuildingIds'],properties:{preserveCurrentStop:{const:true},preserveCompletedStops:{const:true},includeEveryEligibleOrder:{const:true},excludeUnavailableBuildingIds:{type:'array',items:{type:'string'}}}},
          explanation:{type:'array',items:{type:'string'}},recommendationNeeded:{type:'boolean'}
        }
      } } }
    });
    const policy = PolicySchema.parse(JSON.parse(response.output_text));
    const valid = new Set(snapshot.buildings.map(b => b.buildingId));
    if (policy.buildingPriorities.some(p => !valid.has(p.buildingId))) throw new Error('Policy contains unknown building');
    return { policy, source: 'OPENAI' };
  } catch (error) {
    return { policy: fallbackPolicy(snapshot), source: 'FALLBACK', warning: `OpenAI policy failed; fallback used (${error instanceof Error ? error.name : 'unknown'}).` };
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
