import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';
import { randomBytes, createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
// Usage: node scripts/create-checkin-session.mjs input.json
// Output is an ignored private file, never a raw-token console log.
try {
 const env={...parseEnv(await readFile('.env.local','utf8')),...process.env};
 const input=JSON.parse(await readFile(process.argv[2],'utf8'));
 const rounds={'monthly':'monthly-guest','monthly-first':'monthly-first-guest','onboarding-d7':'onboarding-d7-guest','monthly-renewal':'monthly-renewal-guest'};
 const scenario=rounds[input.roundType] ?? (input.roundType==='event' && ['facility','rule'].includes(input.eventContext?.type) ? input.eventContext.type+'-event-guest':null);
 if(!scenario || !input.participantId || !input.roundKey || !input.sentAt || !Number.isFinite(Date.parse(input.sentAt))) throw new Error('Invalid input');
 const token=randomBytes(32).toString('base64url');
 const db=createClient(env.SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data,error}=await db.rpc('create_checkin_session',{p_participant_id:input.participantId,p_round_type:input.roundType,p_round_key:input.roundKey,p_scenario_id:scenario,p_event_type:input.eventContext?.type??null,p_context:input.eventContext??null,p_sent_at:new Date(input.sentAt).toISOString(),p_token_digest:createHash('sha256').update(token).digest('hex')});
 if(error) {console.error('Session creation failed:',error.code);process.exitCode=1;}
 else {await mkdir('artifacts/private',{recursive:true});const file=resolve('artifacts/private/'+data+'.json');await writeFile(file,JSON.stringify({sessionId:data,url:new URL('/c/'+token,env.CHECKIN_APP_ORIGIN).href},null,2),{flag:'wx'});console.log('Session created. Private link file:',file);}
} catch {console.error('Unable to create session. Check local environment and input JSON; no token was logged.');process.exitCode=1;}
