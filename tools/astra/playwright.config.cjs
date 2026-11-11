const {defineConfig}=require('@playwright/test');
module.exports=defineConfig({globalSetup:require.resolve('./assert-lab.cjs'),testDir:'.',testMatch:'*.spec.cjs',fullyParallel:false,workers:1,timeout:60000,
 reporter:[['list'],['html',{outputFolder:'../../Docs/astra/playwright-report',open:'never'}],['json',{outputFile:'../../Docs/astra/evidence/browser-results.json'}]],
 outputDir:'../../Docs/astra/test-results',use:{browserName:'chromium',trace:'retain-on-failure',screenshot:'only-on-failure'},
 projects:[{name:'desktop',use:{viewport:{width:1440,height:900}}},{name:'tablet',use:{viewport:{width:768,height:1024}}},{name:'mobile',use:{viewport:{width:390,height:844}}}]});
