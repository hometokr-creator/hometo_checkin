import "server-only";
import { createHash } from "node:crypto";
import type { CheckinAnswers, CheckinIssue, CheckinIssueTag } from "@/domains/checkin/model/checkin";
import { getCheckinDetailOptions } from "@/domains/checkin/model/checkin-options";
import type { ScenarioNext } from "@/features/run-checkin/model/scenario";
import { pinnedScenario, type SessionRow } from "./scenario-registry";
import { object, keys } from "./http";
import { CheckinError } from "./errors";
const tags=["facility","relationship","settlement","urgent","other"];
function reject(): never { throw new CheckinError("invalid-answer",422); }
function text(value: unknown): string | undefined {
 if(value===undefined) return undefined;
 if(typeof value!=="string" || value.length>500) reject();
 return value.replace(/\r\n?/g,"\n").trim() || undefined;
}
export function canonical(value: unknown): string {
 if(Array.isArray(value)) return "["+value.map(canonical).join(",")+"]";
 if(value && typeof value==="object") return "{"+Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,v])=>JSON.stringify(k)+":"+canonical(v)).join(",")+"}";
 return JSON.stringify(value);
}
const level=(tag: CheckinIssueTag)=>tag==="urgent"?"R1" as const:"R2" as const;
function withoutTriage(issues: CheckinIssue[]) { return issues.map(i=>({tag:i.tag,detail:i.detail,freeText:i.freeText})); }
export function validateSubmission(input: unknown, row: SessionRow) {
 const submission=object(input);keys(submission,["schemaVersion","sessionId","idempotencyKey","answers"]);
 if(submission.sessionId!==row.id) throw new CheckinError("invalid",403);
 if(submission.schemaVersion!==1 || typeof submission.idempotencyKey!=="string" || !submission.idempotencyKey.trim() || submission.idempotencyKey.length>200) reject();
 const raw=object(submission.answers);keys(raw,["responses","issues","freeText","overallTriage"]);
 const responses=object(raw.responses);
 if(!Array.isArray(raw.issues) || raw.issues.length>2) reject();
 const given: CheckinIssue[]=raw.issues.map(value=>{
  const i=object(value);keys(i,["tag","detail","freeText","triageLevel"]);
  if(typeof i.tag!=="string" || !tags.includes(i.tag) || (i.detail!==undefined && (typeof i.detail!=="string" || i.detail.length>80))) reject();
  if(i.triageLevel!==undefined && i.triageLevel!=="R1" && i.triageLevel!=="R2") reject();
  return {tag:i.tag as CheckinIssueTag,detail:i.detail as string|undefined,freeText:text(i.freeText),triageLevel:level(i.tag as CheckinIssueTag)};
 });
 if(new Set(given.map(i=>i.tag)).size!==given.length) reject();
 if(raw.overallTriage!==undefined && raw.overallTriage!=="R1" && raw.overallTriage!=="R2") reject();
 const globalText=text(raw.freeText);
 const scenario=pinnedScenario(row);
 let expected: CheckinAnswers={responses:{},issues:[]};
 let stepId: string|undefined=scenario.entry;
 let outcome: "ok"|"reported"|"urgent"|undefined;
 function advance(next: ScenarioNext): void {
  if(next.type==="step") {stepId=next.stepId;return;}
  if(next.type==="issue-count") {stepId=expected.issues.length<next.lessThan?next.then:next.otherwise;return;}
  if(next.type==="complete-from-answers") {
   expected.issues=expected.issues.filter(i=>i.tag!=="other" || !!(i.freeText || expected.freeText));
   outcome=expected.issues.some(i=>i.tag==="urgent")?"urgent":expected.issues.length || expected.freeText?"reported":"ok";
  } else { if(next.outcome==="renewal") reject(); outcome=next.outcome; }
  stepId=undefined;
 }
 // Reconstruct the permitted path from the pinned scenario, independent of client triage.
 for(let count=0;stepId && count<32;count++) {
  const step=scenario.steps[stepId];if(!step) reject();
  const value=responses[step.answerKey];const control=step.control;
  if(typeof value!=="string") reject();
  expected.responses[step.answerKey]=value;
  if(control.kind==="options") {
   const option=control.options.find(o=>o.value===value);if(!option) reject();
   if(option.presetIssueTag) expected.issues.push({tag:option.presetIssueTag,triageLevel:level(option.presetIssueTag)});
   advance(option.next);
  } else if(control.kind==="tags") {
   const tag=control.tags.find(t=>t.value===value);if(!tag || expected.issues.length>=2 || expected.issues.some(i=>i.tag===tag.value)) reject();
   expected.issues.push({tag:tag.value,triageLevel:level(tag.value)});advance(control.nextByTag[tag.value]);
  } else if(control.kind==="chips") {
   const issue=expected.issues.at(-1);if(!issue || !getCheckinDetailOptions(issue.tag).some(d=>d.value===value)) reject();
   issue.detail=value;advance(control.next);
  } else {
   if(value!=="provided" && value!=="skipped") reject();
   const issue=expected.issues.at(-1);
   const supplied=control.target==="issue" ? given.find(i=>i.tag===issue?.tag)?.freeText : globalText;
   if((value==="provided")!==!!supplied) reject();
   if(control.target==="issue") {if(!issue) reject();if(supplied) issue.freeText=supplied;}
   else if(supplied) {
    expected.freeText=supplied;
    if(!expected.issues.length) expected.issues.push({tag:"other",freeText:supplied,triageLevel:"R2"});
   }
   advance(control.next);
  }
 }
 if(stepId || !outcome || canonical(responses)!==canonical(expected.responses) || canonical(withoutTriage(given))!==canonical(withoutTriage(expected.issues)) || globalText!==expected.freeText) reject();
 expected={...expected,overallTriage:expected.issues.some(i=>i.tag==="urgent")?"R1":expected.issues.length?"R2":undefined};
 const requestHash=createHash("sha256").update(canonical({schemaVersion:1,sessionId:row.id,scenarioId:row.scenario_id,scenarioVersion:row.scenario_version,triageRuleVersion:row.triage_rule_version,answers:expected})).digest("hex");
 const positiveFeedback=outcome==="reported" && !!expected.freeText && (expected.responses.facilityEventStatus==="resolved" || expected.responses.ruleEventStatus==="understood");
 return {answers:expected,outcome,requestHash,idempotencyKey:submission.idempotencyKey,completionMessage:positiveFeedback?"의견 남겨주셔서 감사해요! 잘 전달할게요 🙂":scenario.completionMessages[outcome].text};
}
