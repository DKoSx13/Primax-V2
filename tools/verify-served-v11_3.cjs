const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
(async()=>{
 const report=[];
 for(const [directory,port] of [['Frontend_1_FuelFlow/dist',23081],['Frontend_2_PrimaxPrime/www',23082]]){
  const folder=path.join(root,directory),files=[];
  function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())walk(p);else if(/\.(html|js|css)$/.test(e.name))files.push(p)}}walk(folder);
  for(const file of files){const relative=path.relative(folder,file).split(path.sep).join('/');const r=await fetch('http://localhost:'+port+'/'+relative,{cache:'no-store'});assert(r.ok,relative);assert(r.headers.get('cache-control').includes('no-store'),relative+' stale caching');assert.equal(r.headers.get('x-fuelflow-version'),'V11_3');const actual=Buffer.from(await r.arrayBuffer());assert(actual.equals(fs.readFileSync(file)),relative+' differs from local build');}
  const build=await (await fetch('http://localhost:'+port+'/build.json')).json();report.push({port,source:directory,build,verifiedFiles:files.length,allHtmlJsCssIdentical:true,cacheControl:'no-store'});
 }
 fs.writeFileSync(path.join(root,'Docs/V12.1-reference/served-builds-v11_3.json'),JSON.stringify(report,null,2));console.log(report);
})().catch(e=>{console.error(e);process.exitCode=1});
