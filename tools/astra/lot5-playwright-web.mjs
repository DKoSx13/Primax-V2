import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve,extname } from 'node:path';
import { createGateway } from '/ff/server/gateway.js';
for (const [port,terminal] of [[29481,'T01'],[29484,'T02']]) {
 let turn=0;
 const dispatch=(url,options)=>{
   const dest=new URL(url);
   if(options.method==='POST' && (dest.pathname.endsWith('/refund') || ['/api/v1/authorizations','/api/v1/transactions'].includes(dest.pathname))){
     dest.port=++turn%2?'3000':'3002'; console.log(dest.pathname,dest.port);
   }
   return fetch(dest,options);
 };
 const gateway=createGateway({fetcher:dispatch,env:{...process.env,BACKEND_ORIGIN:'http://backend:3000',FUELFLOW_LOCAL_HTTP:'true',FUELFLOW_COOKIE_SCOPE:String(port),FUELFLOW_TERMINAL_CODE:'PRIMAX-SUR-'+terminal,FUELFLOW_PUBLIC_ORIGIN:'http://127.0.0.1:'+port}});
 createServer(async(req,res)=>{
  if(req.url.startsWith('/api/'))return gateway(req,res);
  const file=resolve('/ff/dist','.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
  if(!file.startsWith('/ff/dist/')){res.writeHead(404).end();return;}
  try{const body=await readFile(file);res.setHeader('content-type',({'.js':'application/javascript','.html':'text/html; charset=utf-8','.css':'text/css','.png':'image/png','.svg':'image/svg+xml'})[extname(file)]||'application/octet-stream');res.end(body);}catch{res.writeHead(404).end();}
 }).listen(port);
}



