const fs=require("node:fs"),path=require("node:path"),Module=require("node:module"),cp=require("node:child_process");
const assert=require("node:assert/strict"),{createHash}=require("node:crypto");
const load=Module.createRequire("/app/package.json"),ts=load("typescript");
module.exports=async function context(){
  const root="/workspace",runId=process.env.A4_READ_RUN,database=process.env.A4_RECEIPT_DATABASE||"a4_legacy";
  assert.match(runId,/^a4-[a-f0-9]{24}$/);assert.equal(process.env.A4_READ_SYNTHETIC,"true");
  assert.ok(["a4_legacy","a4_legacy_restored"].includes(database));
  function url(key,user){const u=new URL(process.env[key]);assert.equal(u.hostname,runId+"-pg");
    assert.equal(u.pathname,"/"+database);assert.equal(u.username,user);assert.equal(u.searchParams.get("schema"),"public");return u.href;}
  const adminURL=url("A4_LEGACY_ADMIN","postgres"),readerURL=url("A4_LEGACY_READER","a4_legacy_reader"),writerURL=url("A4_VEHICLE_WRITER","a4_vehicle_writer");
  const temp=fs.mkdtempSync("/tmp/a4-receipt-"),generated=path.join(temp,"client");
  fs.symlinkSync("/app/node_modules",path.join(temp,"node_modules"),"dir");
  const schema=fs.readFileSync(root+"/Backend/prisma/schema.prisma","utf8").replace(/generator client\s*\{/, 'generator client {\n output = '+JSON.stringify(generated));
  const schemaFile=path.join(temp,"legacy.prisma");fs.writeFileSync(schemaFile,schema,{flag:"wx"});
  cp.execFileSync(process.execPath,["/app/node_modules/prisma/build/index.js","generate","--schema",schemaFile],
    {cwd:temp,env:{...process.env,DATABASE_URL:adminURL,DATABASE_URL_UNPOOLED:adminURL,PRISMA_GENERATE_SKIP_AUTOINSTALL:"true",CHECKPOINT_DISABLE:"1"},stdio:"pipe",timeout:30000});
  const client=require(generated),cache=new Map();
  function compiled(relative){const file=path.resolve(root,relative);if(cache.has(file))return cache.get(file).exports;
    const instance=new Module(file);cache.set(file,instance);instance.require=spec=>{
      if(spec==="@prisma/client")return client;
      if(spec.startsWith(".")){const p=path.resolve(path.dirname(file),spec);return compiled(path.relative(root,p.endsWith(".ts")?p:p+".ts"));}
      return load(spec);};
    instance._compile(ts.transpileModule(fs.readFileSync(file,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,
      experimentalDecorators:true,emitDecoratorMetadata:true,esModuleInterop:true}}).outputText,file);return instance.exports;}
  load("@nestjs/common").Logger.overrideLogger(false);
  const {PrismaService}=compiled("Backend/src/prisma/prisma.service.ts"),{VehiclesRepository}=compiled("Backend/src/vehicles/vehicles.repository.ts");
  const admin=new client.PrismaClient({datasources:{db:{url:adminURL}}}),reader=new client.PrismaClient({datasources:{db:{url:readerURL}}}),
    writer=new PrismaService({datasources:{db:{url:writerURL}}});
  const contract=compiled("services/identity/lab/vehicle-link-durable-contract.ts"),classes=require(root+"/services/identity/lab/vehicle-link-success-authority.cjs");
  const normalizers={plate:compiled("Backend/src/vehicles/plate.dto.ts").normalizePlate,label:compiled("Backend/src/memberships/profile.dto.ts").cleanText};
  let workCalls=0,repositoryCalls=0;
  const snapshot=work=>reader.$transaction(async tx=>{await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");return work(tx);},{isolationLevel:"RepeatableRead",timeout:15000});
  const options={synthetic:true,callerNamespace:"synthetic-identity",ErrorType:contract.DurableLinkError,normalizers,
    reader:{snapshot},writer,repository:db=>{repositoryCalls++;return new VehiclesRepository({atomic:work=>db.atomic(tx=>{workCalls++;return work(tx);})});}};
  const authority=new classes.VehicleSuccessAuthority(options),resultReader=new classes.VehicleSuccessReceiptReader(options);
  async function state(schemaName){assert.ok(["public","vehicle_link_private"].includes(schemaName));
    return admin.$transaction(async tx=>{await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
      const tables=await tx.$queryRawUnsafe("SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname=$1 ORDER BY tablename",schemaName),result={};
      for(const{tablename}of tables){const table='"'+tablename.replaceAll('"','""')+'"';
        result[tablename]=(await tx.$queryRawUnsafe(`SELECT row_to_json(t) AS data FROM "${schemaName}".${table} t`)).map(r=>JSON.stringify(r.data)).sort();}return result;
    },{isolationLevel:"RepeatableRead",timeout:30000});}
  return{root,runId,client,admin,reader,writer,compiled,contract,classes,normalizers,options,authority,resultReader,state,
    counts:()=>({workCalls,repositoryCalls}),hash:value=>createHash("sha256").update(JSON.stringify(value)).digest("hex"),
    close:()=>Promise.allSettled([admin.$disconnect(),reader.$disconnect(),writer.$disconnect()])};
};
