import { MethodResultSchema } from "../../../../packages/shared/src/methodExecution";
// Synthetic transport fixture only. Numeric algorithm parity is tested by the
// Python benchmark/test suite, never by substituting this fixture into a runner.
export function methodFixture(method: "standard" | "enhanced") {
  const metrics = { silhouette: 0.5, davies_bouldin: 1, calinski_harabasz: 98 };
  const features = Array.from({ length: 13 }, (_, i) => `f${i}`);
  const pca = { pcaComponents: 12, cumulativeExplainedVariance: 12/13,
    pcaVariance: features.map((_, i) => ({ component: i+1, eigenvalue: 1, explainedVarianceRatio: 1/13, cumulativeExplainedVariance: (i+1)/13 })),
    pcaLoadings: { variables: features, components: features.map((_,i) => `PC${i+1}`), values: features.map((_,i) => features.map((_,j) => i===j?1:0)) } };
  const shape = { participantCount: 100, selectedK: 2, metrics };
  return MethodResultSchema.parse({ method, assignmentsHash: '2'.repeat(64),
    common: { participantCount: 100, retainedVariables: features, excludedVariables: ['BNT','NPIQ'], phaseCounts: { ADNI1: 100 },
      correlation: pca.pcaLoadings.values, pca, xy: Array.from({ length: 100 }, (_,i) => [i, i%2]) },
    provenance: { compatibilityKey: 'a'.repeat(64), sourceHash: 'b'.repeat(64), participantsHash: 'c'.repeat(64), preprocessingHash: 'd'.repeat(64),
      pcaHash: 'e'.repeat(64), implementationHash: 'f'.repeat(64), dependenciesHash: '1'.repeat(64), configurationHash: '3'.repeat(64), evaluationVersion: 'euclidean-full-lloyd-v1' },
    ...(method === "standard" ? { standard: { ...shape, initialization: 'random', silhouetteSelectedK: 2,
      silhouetteByK: Array.from({length:9},(_,i)=>({k:i+2,silhouette:0.5-i/100})),
      runs: Array.from({length:30},(_,seed)=>({seed,iterations:2,convergedBeforeMaxIter:true,clusterSizes:[50,50],metrics})),
      ariBySeed: Array.from({length:30},(_,seed)=>({seed,adjustedRandIndex:1})) } } : { enhanced: {
      ...shape, ...pca, initialization: 'DPC', iterations:2,convergedBeforeMaxIter:true,clusterSizes:[50,50],retainedVariables:features,excludedVariables:['BNT','NPIQ'],
      nbclust:{votes:Array.from({length:9},(_,i)=>({k:i+2,count:i===0?26:0})),indices:Array.from({length:26},(_,i)=>({index:`fixture-${i}`,status:'success',recommendedK:2})),tieOccurred:false,reproducible:true},
      dpc:{ cutoffPercentile:0.02,distanceCutoff:1,centroidCount:2,dimensions:12,pairwiseDistanceCount:4950,determinismPassed:true,
        centers:[{rid:'1',rho:2,delta:3,gamma:6,coordinates:Array(12).fill(0)},{rid:'2',rho:2,delta:3,gamma:6,coordinates:Array(12).fill(1)}],
        decisionGraph:Array.from({length:100},(_,i)=>({rho:2,delta:3,gamma:6,selected:i<2})),
        ariByRun:[1,2,3].map(seed=>({seed,adjustedRandIndex:1})) } } }),
    calculation:{n:100,k:2,representation:'synthetic transport fixture',seed:0,
      exampleParticipant:{rid:'1',cluster:0,a:1,b:2,s:0.5,singleton:false},daviesBouldin:{sigma0:1,sigma1:1,centroidDistance:2},calinskiHarabasz:{ssb:10,ssw:10},metrics},
    labels:Array.from({length:100},(_,i)=>i%2),centroids:[{cluster:0,x:49,y:0},{cluster:1,x:50,y:1}],timings:{total:0.1},cacheHits:{preprocessing:false,pca:false} });
}
