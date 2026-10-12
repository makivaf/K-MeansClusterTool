import { z } from 'zod';
const hash = z.string().regex(/^[a-f0-9]{64}$/);
export const StudyPreparationSchema = z.object({
  status: z.enum(['preparing', 'ready', 'error']),
  stage: z.string(), error: z.string().nullable(),
  key: hash.optional(), sourceFilesHash: hash.optional(), settingsHash: hash.optional(), codeHash: hash.optional(),
  dependenciesHash: hash.optional(), sourceHash: hash.optional(), preprocessingHash: hash.optional(), pcaHash: hash.optional(),
  participantCount: z.number().int().optional(), retainedVariables: z.array(z.string()).optional(),
  cacheHit: z.boolean().optional(), timings: z.record(z.number().finite().nonnegative()).optional()
}).strict().superRefine((value, ctx) => {
  if (value.status === 'ready' && (!value.key || !value.sourceFilesHash || !value.settingsHash || !value.codeHash || !value.dependenciesHash ||
    !value.sourceHash || !value.preprocessingHash || !value.pcaHash || value.participantCount !== 2437 || value.retainedVariables?.length !== 13 || value.error !== null))
    ctx.addIssue({code:z.ZodIssueCode.custom,message:'Incomplete prepared dataset evidence.'});
});
export type StudyPreparation = z.infer<typeof StudyPreparationSchema>;
