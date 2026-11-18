// New process after restart / logical restore. No fixtures or linking invoked.
const assert=require("node:assert/strict");
(async()=>{const ctx=await require("./identity-a4-vehicle-receipt-support.cjs")();
  try{const manifest=JSON.parse(process.env.A4_RECEIPT_MANIFEST);
    assert.equal(ctx.hash(await ctx.state("public")),manifest.publicHash);
    assert.equal(ctx.hash(await ctx.state("vehicle_link_private")),manifest.receiptHash);
    for(const expected of manifest.receipts){const actual=await ctx.resultReader.lookup({userId:expected.userId,
      expectedMembershipId:expected.membershipId,operationId:expected.operationId});assert.deepEqual(actual,{status:"COMMITTED",receipt:expected});}
    assert.equal(ctx.counts().workCalls,0);assert.equal(ctx.counts().repositoryCalls,0);
    console.log(JSON.stringify({success:true,checks:["Fresh process: all receipts and UUID/results recovered, complete public/private logical hashes equal, no link invoked"],
      receiptCount:manifest.receipts.length,counts:ctx.counts(),database:process.env.A4_RECEIPT_DATABASE}));
  }finally{await ctx.close();}
})().catch(error=>{console.error(JSON.stringify({code:error.code||"ERROR",message:String(error.message).replace(/postgres(?:ql)?:\/\/[^\s]+/g,"[private-url]").slice(-2000)}));process.exitCode=1;});
