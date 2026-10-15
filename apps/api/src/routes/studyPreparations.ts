import { Router } from 'express';
import { studyPreparationStore } from '../services/studyPreparation';
import { requireTrustedBrowserOrigin } from '../httpSecurity';
export function createStudyPreparationsRouter(store=studyPreparationStore) {
  const router=Router();
  router.use((_request,response,next)=>{if(process.env.NODE_ENV==='production'){response.status(403).json({error:'Dataset preparation requires the local API.'});return;}next();});
  router.get('/:uploadRef',(request,response)=>{
    try {const state=store.get(request.params.uploadRef);response.status(state?200:404).json(state??{error:'Dataset preparation not found.'});}
    catch {response.status(400).json({error:'Invalid upload reference.'});}
  });
  router.post('/:uploadRef',requireTrustedBrowserOrigin,(request,response)=>{
    try {const state=store.start(request.params.uploadRef);response.status(state.status==='preparing'?202:200).json(state);}
    catch {response.status(409).json({error:'Unable to prepare this dataset. Validate the seven exports again.'});}
  });
  return router;
}
