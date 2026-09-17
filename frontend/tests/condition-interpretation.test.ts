import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createConversationRunner } from '../src/lib/server/ai/application/conversation-session.ts';
import { createConditionMemory, conditionView } from '../src/lib/server/ai/application/condition-memory.ts';
import { createUserConditionLoader } from '../src/lib/server/ai/adapters/user-condition-context.ts';
import { createCatalogTools } from '../src/lib/server/ai/tools/catalog-tools.ts';
import { createSpringClient } from '../src/lib/server/spring-client.ts';
import type { ConversationProvider } from '../src/lib/server/ai/conversation-contracts.ts';
const owner='00000000-0000-4000-8000-000000000001';
const seeds=[{input:{inputKey:'person.birth_date',selector:{},target:{kind:'self' as const,id:owner},scope:{kind:'user' as const},valueType:'date' as const},stored:null},
 ...['carbon_green','eco_mileage'].map(code=>({input:{inputKey:'membership.is_member',selector:{service_code:code},target:{kind:'self' as const,id:owner},scope:{kind:'user' as const},valueType:'boolean' as const},stored:null}))];
const spring={baseUrl:'http://unused.test',fetch:async()=>{throw Error('unexpected retrieval');}};
const turn={authenticatedUserId:owner,turnId:'t1',text:'나는 1995년 4월 12일생이야. 가입은 했어.'};
function setup(interpret:()=>Promise<unknown>,respond?:ConversationProvider['respond']){
 const provider:ConversationProvider={create:async()=>({id:'test',responseIds:[]}),respond:respond??(async()=>({text:'어느 서비스인가요?',calls:[]})),close:async()=>{}};
 let loads=0;
 const runner=createConversationRunner({provider,catalog:createCatalogTools(createSpringClient(spring),async()=>[]),load:createUserConditionLoader(spring),
  prepareConditions:async()=>{loads++;return createConditionMemory(owner,seeds);},interpretConditions:interpret});
 return {runner,session:runner.createSession(owner),loads:()=>loads};
}
const mixed={changes:[{slot:0,status:'known',value:'1995-04-12',quote:'나는 1995년 4월 12일생이야.'}],clarification:{question:'어느 서비스인가요?',slots:[1,2]}};
test('facts are interpreted before an answer without model-selected tools; clarification preserves independent facts',async()=>{
 const parsed=[mixed,{changes:[],clarification:mixed.clarification},{changes:[{slot:2,status:'known',value:true,quote:'에코마일리지 말이야'}],clarification:null}];
 const {runner,session,loads}=setup(async()=>parsed.shift(),async(_h,_i,tools,instructions)=>{
  assert.ok(!tools.some(t=>t.name==='update_conditions'));
  assert.match(instructions,/1995-04-12/);assert.doesNotMatch(instructions,/membership\.is_member|person\.birth_date/);return {text:'확인했어요.',calls:[]};
 });
 await runner.runTurn(session,turn,{commit:async result=>{assert.equal(session.memory.slots.length,0);assert.equal(conditionView(result.memory)[0].fact.value,'1995-04-12');}});
 const saved=structuredClone(session.memory);
 await runner.runTurn(session,{...turn,turnId:'t2',text:'응'},{commit:async()=>{}});assert.deepEqual(session.memory,saved);
 await runner.runTurn(session,{...turn,turnId:'t3',text:'에코마일리지 말이야'},{commit:async()=>{}});
 assert.deepEqual(conditionView(session.memory).map(x=>[x.fact.status,x.fact.value]),[['known','1995-04-12'],['missing',null],['known',true]]);
 assert.equal(loads(),1);
});
test('ambiguous target writes and failed extraction/answer/commit never publish working memory',async()=>{
 for(const failure of ['overlap','interpret','reply','commit']){
  const {runner,session}=setup(async()=>{if(failure==='interpret')throw Error('injected');return failure==='overlap'?{...mixed,clarification:{question:'생일?',slots:[0]}}:mixed;},
   async()=>{if(failure==='reply')throw Error('injected');return {text:'답변',calls:[]};});
  const before=structuredClone(session.memory);
  await assert.rejects(runner.runTurn(session,turn,{commit:async()=>{if(failure==='commit')throw Error('injected');}}));
  assert.deepEqual(session.memory,before);assert.deepEqual(session.history,[]);
 }
});
