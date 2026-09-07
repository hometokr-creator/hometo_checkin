import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { getDb } from "../db";
import { accessEnvironment } from "../env";
import { CheckinError, databaseError } from "./errors";
import { uuid } from "./http";
import { sessionDto, type SessionRow } from "./scenario-registry";
export const cookieName = (sessionId: string) => "checkin-" + sessionId;
export const digestToken = (token: string) => createHash("sha256").update(token).digest("hex");
interface Grant { tokenId: string; sessionId: string; exp: number; }
export function signGrant(grant: Grant) {
 const encoded=Buffer.from(JSON.stringify(grant)).toString("base64url");
 return encoded+"."+createHmac("sha256",accessEnvironment().secret).update(encoded).digest("base64url");
}
export function verifyGrant(value: string): Grant {
 try {
  const [encoded,signature,...rest]=value.split(".");
  if(rest.length || !encoded || !signature || value.length>1024) throw new Error();
  const actual=Buffer.from(signature,"base64url"); const expected=createHmac("sha256",accessEnvironment().secret).update(encoded).digest();
  if(actual.length!==expected.length || !timingSafeEqual(actual,expected)) throw new Error();
  const grant=JSON.parse(Buffer.from(encoded,"base64url").toString("utf8")) as Grant;
  uuid(grant.tokenId);uuid(grant.sessionId);
  if(!Number.isFinite(grant.exp) || grant.exp<=Date.now()) throw new CheckinError("expired",410);
  return grant;
 } catch(e) { if(e instanceof CheckinError && e.code==="expired") throw e; throw new CheckinError("invalid",401); }
}
async function load(tokenId: string, sessionId: string) {
 const db=getDb();
 const {data:token,error:te}=await db.from("checkin_access_token").select("id,session_id,expires_at,revoked_at").eq("id",tokenId).eq("session_id",sessionId).maybeSingle();
 if(te) databaseError(te);
 if(!token || token.revoked_at) throw new CheckinError("invalid",401);
 if(Date.parse(token.expires_at)<=Date.now()) throw new CheckinError("expired",410);
 const {data:row,error:se}=await db.from("checkin_session").select("*").eq("id",sessionId).maybeSingle();
 if(se) databaseError(se);
 if(!row || row.status==="cancelled") throw new CheckinError("invalid",401);
 const {data:participant,error:pe}=await db.from("checkin_participant").select("display_name,active").eq("id",row.participant_id).maybeSingle();
 if(pe) databaseError(pe);
 if(!participant?.active) throw new CheckinError("invalid",401);
 const session=sessionDto(row as SessionRow,participant.display_name);
 return {token, row:row as SessionRow, session};
}
export async function exchangeToken(token: unknown) {
 if(typeof token!=="string" || !/^[A-Za-z0-9_-]{43}$/.test(token)) throw new CheckinError("invalid",401);
 const db=getDb();
 const {data,error}=await db.from("checkin_access_token").select("id,session_id").eq("token_digest",digestToken(token)).maybeSingle();
 if(error) databaseError(error);
 if(!data) throw new CheckinError("invalid",401);
 const loaded=await load(data.id,data.session_id);
 if(loaded.row.status!=="completed" && Date.parse(loaded.row.answer_expires_at)<=Date.now()) throw new CheckinError("expired",410);
 const grant={tokenId:data.id,sessionId:data.session_id,exp:Date.parse(loaded.token.expires_at)};
 const {error:usedError}=await db.from("checkin_access_token").update({last_used_at:new Date().toISOString()}).eq("id",data.id);
 if(usedError) databaseError(usedError);
 return {grant,value:signGrant(grant)};
}
export async function authorize(sessionId: string) {
 uuid(sessionId);
 const value=(await cookies()).get(cookieName(sessionId))?.value;
 if(!value) throw new CheckinError("invalid",401);
 const grant=verifyGrant(value);
 if(grant.sessionId!==sessionId) throw new CheckinError("invalid",403);
 return {...await load(grant.tokenId,sessionId),tokenId:grant.tokenId};
}
