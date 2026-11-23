import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { parseScxml, validateScxmlSource } from '../scxml';
const root=(body:string)=>`<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" initial="a"><state id="a">${body}</state></scxml>`;
suite('Stage 26 static-conformance consolidation',()=>{
 test('emits one source-ranged diagnostic for a static violation',()=>{const xml=root(`<onentry><raise event="door.*"/></onentry>`);const model=parseScxml(xml);const matches=model.problems.filter(item=>item.code==='schema.eventName');assert.strictEqual(matches.length,1);assert.match(xml.slice(matches[0].startOffset,matches[0].endOffset),/event="door\.\*"/);assert.strictEqual(model.errors.filter(item=>/concrete event name/.test(item)).length,1);});
 test('source tree owns transition descriptors and completion references',()=>{const xml=root(`<transition event="bad! done.state.missing done.invoke.worker"/>`);const codes=validateScxmlSource(xml).map(item=>item.code);assert.ok(codes.includes('semantic.eventDescriptor'));assert.ok(codes.includes('semantic.missingStateCompletion'));assert.ok(codes.includes('semantic.missingInvokeCompletion'));});
 test('payload-like XML does not create static diagnostics',()=>{const xml=root(`<onentry><send event="payload"><content><![CDATA[<raise event="bad *"/><transition event="bad!"/>]]></content></send></onentry>`);const codes=parseScxml(xml).problems.map(item=>item.code);assert.ok(!codes.includes('semantic.eventDescriptor'));assert.strictEqual(codes.filter(code=>code==='schema.eventName').length,0);});
 test('behavioral analysis uses stable behavior codes',()=>{const model=parseScxml(`<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" initial="a"><state id="a"/><state id="unused"/></scxml>`);assert.ok(model.problems.some(item=>item.code==='behavior.unreachable'&&item.severity==='warning'));});
 test('legacy document-wide static regex passes are removed',()=>{const source=fs.readFileSync(path.join(__dirname,'..','scxml.ts'),'utf8');for(const token of ['function validateEventDescriptors','function validateInvokeCompletionEvents','function validateProducedEventNames'])assert.ok(!source.includes(token),token);assert.ok(!source.includes("for (const match of text.matchAll(/<raise"));assert.ok(!source.includes("for (const match of text.matchAll(/<send"));});
});
