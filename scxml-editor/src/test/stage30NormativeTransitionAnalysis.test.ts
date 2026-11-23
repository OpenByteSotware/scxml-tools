import * as assert from 'assert';import { parseScxml } from '../scxml';
const root=(body:string,initial='parent')=>`<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" initial="${initial}">${body}</scxml>`;
suite('Stage 30 normative transition analysis',()=>{
test('reports source-depth priority',()=>{const p=parseScxml(root(`<state id="parent" initial="child"><transition event="go" target="outside"/><state id="child"><transition event="go" target="outside"/></state></state><state id="outside"/>`)).problems;assert.ok(p.some(x=>x.code==='behavior.depthPriority'));});
test('validates internal domains',()=>assert.ok(parseScxml(root(`<state id="parent" initial="child"><state id="child"/><transition type="internal" event="leave" target="outside"/></state><state id="outside"/>`)).problems.some(x=>x.code==='behavior.internalTransition')));
test('reports eventless dominance',()=>assert.ok(parseScxml(root(`<state id="parent"><transition target="done"/><transition event="go" target="done"/></state><final id="done"/>`)).problems.some(x=>x.code==='behavior.eventlessDominance')));
test('does not prioritize disjoint events',()=>assert.ok(!parseScxml(root(`<state id="parent" initial="child"><transition event="parent.go" target="outside"/><state id="child"><transition event="child.go" target="outside"/></state></state><state id="outside"/>`)).problems.some(x=>x.code==='behavior.depthPriority')));
});
