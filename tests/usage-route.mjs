import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {readFile} from 'node:fs/promises';
let writes=0;globalThis.__usageTest={write:()=>{writes++;return true;}};
const modules={
 '@/db':'export const getDb=()=>({$client:{}});',
 '@/lib/server':`export const originCheck=()=>{};export const owner=async req=>req.headers.get('x-test-owner')==='yes';export const result=(data,status=200,headers={})=>Response.json(data,{status,headers});export const failure=()=>Response.json({error:'bad request'},{status:400});export const readText=async(req,limit)=>{const text=await req.text();if(new TextEncoder().encode(text).length>limit)throw new Error('#err.requestTooLarge');return text;};`,
 '@/lib/rate-limit':`export const consumePublicAttempt=req=>req.headers.get('x-test-rate')?30:0;`,
 '@/lib/usage':`export const recordUsage=()=>globalThis.__usageTest.write();`
};
const output=await build({entryPoints:['app/api/usage/route.ts'],bundle:true,write:false,platform:'node',format:'esm',plugins:[{name:'test-dependencies',setup(b){
 b.onResolve({filter:/^@\//},a=>({path:a.path,namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},a=>({contents:modules[a.path],loader:'js'}));
 if(process.env.TT_USAGE_ROUTE_MUTATION==='1')b.onLoad({filter:/route\.ts$/},async a=>({contents:(await readFile(a.path,'utf8')).replace('if(await owner(req))','if(false)'),loader:'ts'}));
}}]});
const {POST}=await import('data:text/javascript;base64,'+Buffer.from(output.outputFiles[0].text).toString('base64'));
const send=(body,headers={})=>POST(new Request('https://example.test/api/usage',{method:'POST',headers,body:typeof body==='string'?body:JSON.stringify(body)}));
const event={id:'audio',session:'00000000-0000-4000-8000-000000000001'};
assert.equal((await send(event,{'x-test-owner':'yes'})).status,200);assert.equal(writes,0,'author must not increase counters');
assert.equal((await send(event,{'x-test-rate':'yes'})).status,429);assert.equal(writes,0);
for(const bad of [{id:1},'{','x'.repeat(513)])assert.ok((await send(bad)).status>=400);
assert.equal(writes,0);assert.equal((await send(event)).status,200);assert.equal(writes,1);
delete globalThis.__usageTest;console.log('PASS usage route: author exclusion, rate limit, invalid requests, accepted event (auth/database mocked)');
