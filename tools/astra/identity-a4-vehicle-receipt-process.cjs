// Own new provider process: kill before/after commit, or perform lookup only.
const assert=require("node:assert/strict");
const mode=process.argv[2];assert.ok(["commit-wait","abort-wait","lookup"].includes(mode));
process.once("message",async input=>{
  let context;
  try{context=await require("./identity-a4-vehicle-receipt-support.cjs")();
    if(mode==="abort-wait"){
      const writer={atomic:work=>context.writer.atomic(async tx=>{
        await work(tx);process.send({phase:"BEFORE_COMMIT"});
        await new Promise(()=>{}); // Never return the callback / send COMMIT.
      })};
      const authority=new context.classes.VehicleSuccessAuthority({...context.options,writer});
      await authority.submit(input.userId,input.command);
    }else if(mode==="commit-wait"){
      await context.authority.submit(input.userId,input.command);
      process.send({phase:"AFTER_COMMIT"}); // No business receipt delivered to the caller.
      setInterval(()=>{},1000); // The parent kills only this freshly forked process.
    }else{const value=await context.resultReader.lookup(input);await context.close();process.send({result:value});process.disconnect();}
  }catch(error){if(context)await context.close();process.send({error:{code:error.code||"ERROR",outcome:error.outcome||"UNKNOWN"}});process.disconnect();}
});
