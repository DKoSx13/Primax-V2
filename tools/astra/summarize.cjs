const fs=require('node:fs');
const file=process.argv[2];
const report=JSON.parse(fs.readFileSync(file,'utf8'));
const tests=[];
function walk(suites){for(const suite of suites){for(const spec of suite.specs||[])for(const test of spec.tests)tests.push({title:spec.title,project:test.projectName,status:test.status,results:test.results.map(r=>({status:r.status,duration:r.duration,errors:r.errors?.map(e=>e.message),attachments:r.attachments?.map(a=>({name:a.name,path:a.path,contentType:a.contentType}))}))});walk(suite.suites||[])}}
walk(report.suites);console.log(JSON.stringify({stats:report.stats,tests},null,2));
