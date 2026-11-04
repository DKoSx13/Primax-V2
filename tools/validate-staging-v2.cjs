const assert = require('node:assert/strict');
function assertStagingV2(env) {
 const origin=(name)=>{let u;try{u=new URL(env[name]);}catch{throw Error('Missing/invalid '+name);}
  if(u.protocol!=='https:'||u.origin!==env[name]||u.username||u.password||/REPLACE|example\.invalid|v12[.-]?1/i.test(u.href))throw Error(name+' must be an exact new V2 HTTPS origin');return u.origin;};
 const fuel=origin('FUELFLOW_PUBLIC_ORIGIN'),prime=origin('PRIME_PUBLIC_ORIGIN'),control=origin('PRIMAX_CONTROL_PUBLIC_URL'),backend=origin('BACKEND_ORIGIN');
 origin('PLATE_RECOGNITION_URL');origin('KIOSK_REDIS_REST_URL');
 assert.equal(new Set([fuel,prime,control,backend]).size,4,'V2 component origins must be distinct');
 assert.equal(env.PRIME_API_BASE_URL,backend+'/api/v1','Prime must point exactly to the V2 API');
 assert.equal(env.PRIMAX_CONTROL_API_URL,'/api/v1','Control must use its same-origin proxy');
 assert.deepEqual(new Set(String(env.CORS_ORIGINS).split(',')),new Set([fuel,prime,control]),'CORS must contain only the three exact V2 origins');
 for(const key of ['DATABASE_URL','DATABASE_URL_UNPOOLED']){
  let u;try{u=new URL(env[key]);}catch{throw Error('Missing/invalid '+key+' (value withheld)');}
  if(!['postgres:','postgresql:'].includes(u.protocol)||!u.hostname.endsWith('.neon.tech')||u.hostname!==env.STAGING_V2_NEON_HOST&&u.hostname.replace('-pooler.','.')!==env.STAGING_V2_NEON_HOST||u.pathname!=='/primax_v2_staging'||u.searchParams.get('sslmode')!=='require')throw Error('Use the verified independent V2 Neon database with TLS (value withheld)');
 }
 if(!env.STAGING_V2_NEON_PROJECT_ID||/REPLACE/i.test(env.STAGING_V2_NEON_PROJECT_ID))throw Error('Record the independently verified V2 Neon project ID');
 for(const key of ['JWT_SECRET','KIOSK_API_KEY','KIOSK_GATEWAY_SECRET','KIOSK_REDIS_REST_TOKEN','OCR_SERVICE_SECRET'])if(String(env[key]||'').length<32||/REPLACE/.test(env[key]))throw Error('Missing private '+key+' (value withheld)');
 if(!/^\$2[aby]\$(1[2-5])\$[./A-Za-z0-9]{53}$/.test(env.KIOSK_OPERATOR_PASSWORD_HASH||''))throw Error('Operator requires a bcrypt hash, cost 12–15');
 if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(env.KIOSK_STATION_ID||''))throw Error('Use the provisioned V2 station UUID');
 for(const [key,value] of Object.entries({APP_MODE:'academic',DATABASE_PURPOSE:'academic-demo',PAYMENT_ENV:'demo',DEMO_WALLET_ENABLED:'true',KIOSK_SESSION_NAMESPACE:'primax-v2-staging',SHOW_DEMO_ADMIN_CREDENTIALS:'false',PLATE_RECOGNITION_ENABLED:'true'}))assert.equal(env[key],value,'Invalid V2 '+key);
 if(env.KIOSK_REDIS_URL||env.CULQI_SECRET_KEY)throw Error('Staging demo must not use local Redis or commercial payment keys');
 return {valid:true,origins:[fuel,prime,control,backend],database:'independent V2 Neon target; value withheld'};
}
module.exports={assertStagingV2};
if(require.main===module){try{console.log(JSON.stringify(assertStagingV2(process.env)));}catch(e){console.error(e.message);process.exitCode=1;}}
