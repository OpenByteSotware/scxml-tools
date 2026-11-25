import * as assert from 'assert';
import { validateScxmlSource } from '../scxml';
import { ScxmlSimulator } from '../simulator';
const chart=(event:string)=>`<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" initial="a"><state id="a"><transition event="${event}" target="pass"/></state><final id="pass"/></scxml>`;
const descriptors=(event:string)=>validateScxmlSource(chart(event)).filter(p=>p.code==='semantic.eventDescriptor');
suite('Stage 56 event-descriptor validation',()=>{
 test('accepts concrete prefix wildcard and descriptor lists',()=>{for(const value of ['door','door.open','door.*','*','error error.execution done.state.*'])assert.strictEqual(descriptors(value).length,0,value);});
 test('rejects invalid characters and malformed wildcard placement',()=>{for(const value of ['bad!','door*','door.*.open','*.open','door..open','.door','door.'])assert.strictEqual(descriptors(value).length,1,value);});
 test('ranges the transition event attribute and uses the stable code',()=>{const xml=chart('door.*.open');const item=validateScxmlSource(xml).find(p=>p.code==='semantic.eventDescriptor');assert.ok(item);assert.match(xml.slice(item!.startOffset,item!.endOffset),/event="door\.\*\.open"/);});
 test('does not validate completion references for wildcard descriptors',()=>{const p=validateScxmlSource(chart('done.state.* done.invoke.*'));assert.ok(!p.some(x=>x.code==='semantic.missingStateCompletion'||x.code==='semantic.missingInvokeCompletion'),JSON.stringify(p));});
 test('simulator preserves prefix and wildcard matching semantics',()=>{for(const descriptor of ['door','door.*','*']){const simulator=new ScxmlSimulator(chart(descriptor));simulator.initialize();assert.deepStrictEqual(simulator.dispatch('door.open').snapshot.active,['pass'],descriptor);}});
 test('descriptor lists match any member',()=>{const simulator=new ScxmlSimulator(chart('window.open door'));simulator.initialize();assert.deepStrictEqual(simulator.dispatch('door.closed').snapshot.active,['pass']);});
});
