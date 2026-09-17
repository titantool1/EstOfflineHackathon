import test from "node:test";
import assert from "node:assert/strict";
import { isMissionEvent, isMissionEventInput, isMissionRecommendationBatch, isMissionRecommendationInput } from "../src/features/missions/contract.ts";
import { createMissionHandlers } from "../src/lib/server/missions-bff.ts";
import { createMissionsSpring, type MissionsSpring } from "../src/lib/server/missions-spring.ts";

const clientRequestId="00000000-0000-4000-8000-000000000001",batchId="00000000-0000-4000-8000-000000000002",itemId="00000000-0000-4000-8000-000000000003",eventId="00000000-0000-4000-8000-000000000004";
const batch={batchId,algorithmVersion:"interest-mapped-catalog-order-v1" as const,selectionBasis:"catalog_exploration" as const,createdAt:"2026-09-17T01:00:00.123456Z",items:[{itemId,position:0,programKey:"P",actionId:"A",identityBasis:"raw",programTitle:"title",programSummary:"summary",programStatusRaw:"unknown",conditionCount:0,matchedInterestIds:[],eligibilityStatus:"not_evaluated" as const,locationStatus:"unknown" as const,relatedPlaceCount:0}]};
const event={eventId,clientEventId:clientRequestId,batchId,itemId,eventType:"impression" as const,occurredAt:"2026-09-17T01:00:00.123456Z",recordedAt:"2026-09-17T01:00:01.123456Z"};
const ok=<T>(data:T,requestId:string)=>({status:200,body:{data,error:null,requestId}});
const post=(url:string,body:unknown,headers:Record<string,string>={})=>new Request(url,{method:"POST",headers:{Origin:"https://eco.test","Content-Type":"application/json",...headers},body:JSON.stringify(body)});

test("mission contracts reject extra owner fields, invalid bounds and malformed event kinds",()=>{
  assert.equal(isMissionRecommendationInput({clientRequestId}),true);assert.equal(isMissionRecommendationInput({clientRequestId,limit:20}),true);
  assert.equal(isMissionRecommendationInput({clientRequestId,limit:21}),false);assert.equal(isMissionRecommendationInput({clientRequestId,userId:itemId}),false);
  assert.equal(isMissionRecommendationBatch(batch),true);assert.equal(isMissionRecommendationBatch({...batch,items:[{...batch.items[0],position:1}]}),false);
  assert.equal(isMissionEventInput({...event,eventId:undefined,recordedAt:undefined}),false);assert.equal(isMissionEventInput({clientEventId:clientRequestId,batchId,itemId,eventType:"skip",occurredAt:event.occurredAt}),false);
  assert.equal(isMissionEvent(event),true);
});

test("BFF validates origin/body and forwards only session, csrf and fixed mission paths",async()=>{
  const calls:unknown[][]=[];const spring:MissionsSpring={
    async createRecommendation(value,requestId,cookie,csrf){calls.push(["create",value,requestId,cookie,csrf]);return ok(batch,requestId!)},
    async getRecommendation(value,requestId,cookie){calls.push(["get",value,requestId,cookie]);return ok(batch,requestId!)},
    async recordEvent(value,requestId,cookie,csrf){calls.push(["event",value,requestId,cookie,csrf]);return ok(event,requestId!)},
  };const handlers=createMissionHandlers({spring});
  const headers={Host:"eco.test",Cookie:"ECOTEAMSESSION=owner","X-CSRF-TOKEN":"csrf","X-Request-Id":"mission-1","X-User-Id":"other"};
  assert.equal((await handlers.createRecommendation(post("https://eco.test/api/missions/recommendations",{clientRequestId},headers))).status,200);
  assert.equal((await handlers.getRecommendation(new Request("https://eco.test/api/missions/recommendations/"+batchId,{headers}),batchId)).status,200);
  assert.equal((await handlers.recordEvent(post("https://eco.test/api/missions/events",{clientEventId:clientRequestId,batchId,itemId,eventType:"impression",occurredAt:event.occurredAt},headers))).status,200);
  assert.deepEqual(calls.map(call=>call[0]),["create","get","event"]);assert.equal(calls[0][3],"ECOTEAMSESSION=owner");assert.equal(calls[0][4],"csrf");
  assert.equal((await handlers.createRecommendation(post("https://eco.test/api/missions/recommendations",{clientRequestId},{Origin:"https://evil.test"}))).status,403);
  assert.equal((await handlers.getRecommendation(new Request("https://eco.test"),"bad")).status,400);
});

test("Spring helper fixes paths and validates returned snapshots",async()=>{
  const calls:string[]=[];const spring=createMissionsSpring({baseUrl:"http://spring:8080",fetch:async(input,init)=>{const requestId=new Headers(init?.headers).get("X-Request-Id")!;calls.push(`${init?.method??"GET"} ${new URL(String(input)).pathname}`);const data=String(input).endsWith("/events")?event:batch;return Response.json({data,error:null,requestId},{headers:{"X-Request-Id":requestId}})}});
  assert.equal((await spring.createRecommendation({clientRequestId},"a","cookie","csrf")).status,200);assert.equal((await spring.getRecommendation(batchId,"b","cookie")).status,200);assert.equal((await spring.recordEvent(event,"c","cookie","csrf")).status,200);
  assert.deepEqual(calls,["POST /api/missions/recommendations",`GET /api/missions/recommendations/${batchId}`,"POST /api/missions/events"]);
});
