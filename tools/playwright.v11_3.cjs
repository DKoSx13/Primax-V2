require('./local-targets.cjs').assertLocalTargets();
const {defineConfig}=require('../Frontend_2_PrimaxPrime/node_modules/@playwright/test');
module.exports=defineConfig({testDir:'.',testMatch:'v11_3*.spec.cjs',timeout:60000,workers:1,reporter:[['list'],['json',{outputFile:'../Docs/V12.1-reference/browser-v11_3-results.json'}]],outputDir:'test-results/v11_3',use:{browserName:'chromium',channel:'chrome',screenshot:'only-on-failure'}});
