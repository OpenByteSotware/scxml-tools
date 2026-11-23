import * as assert from 'assert';
import { ScxmlSimulator } from '../simulator';

suite('Stage 39 dynamic send and cancel semantics', () => {
  test('evaluates eventexpr targetexpr delayexpr and idlocation', () => {
    const xml=`<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" datamodel="ecmascript" initial="a"><datamodel><data id="eventName" expr="'timeout'"/><data id="targetName" expr="'#_scxml_' + _sessionid"/><data id="delayValue" expr="'25ms'"/><data id="generated" expr="''"/></datamodel><state id="a"><onentry><send eventexpr="eventName" targetexpr="targetName" delayexpr="delayValue" idlocation="generated"/></onentry></state></scxml>`;
    const result=new ScxmlSimulator(xml).initialize();
    const effect=result.effects.find(item=>item.kind==='send');
    assert.ok(effect&&effect.event==='timeout'&&effect.delayMs===25);
    assert.strictEqual(result.snapshot.dataModel.generated,effect?.id);
  });

  test('constructs event data from namelist and parameters', () => {
    const xml=`<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" datamodel="ecmascript" initial="a"><datamodel><data id="value" expr="7"/><data id="copy" expr="9"/></datamodel><state id="a"><onentry><send id="s1" event="go" delay="1s" namelist="value"><param name="double" expr="value * 2"/><param name="reference" location="copy"/></send></onentry></state></scxml>`;
    const effect=new ScxmlSimulator(xml).initialize().effects.find(item=>item.kind==='send');
    assert.deepStrictEqual(effect&&effect.kind==='send'?effect.data:undefined,{value:7,double:14,reference:9});
  });

  test('content expression becomes complete event data', () => {
    const xml=`<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" datamodel="ecmascript" initial="a"><datamodel><data id="payload" expr="{ code: 12 }"/></datamodel><state id="a"><onentry><send id="s1" event="go" delay="1s"><content expr="payload"/></send></onentry></state></scxml>`;
    const effect=new ScxmlSimulator(xml).initialize().effects.find(item=>item.kind==='send');
    assert.deepStrictEqual(effect&&effect.kind==='send'?effect.data:undefined,{code:12});
  });

  test('sendidexpr cancels a dynamically identified pending send', () => {
    const xml=`<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" datamodel="ecmascript" initial="a"><datamodel><data id="timerId" expr="'timer'"/></datamodel><state id="a"><onentry><send id="timer" event="timeout" delay="10s"/></onentry><transition event="stop"><cancel sendidexpr="timerId"/></transition></state></scxml>`;
    const simulator=new ScxmlSimulator(xml);simulator.initialize();
    const result=simulator.dispatch('stop');
    assert.deepStrictEqual(result.snapshot.pending,[]);
    assert.ok(result.effects.some(item=>item.kind==='cancel'&&item.id==='timer'));
  });

  test('scheduled delivery exposes send metadata and payload in _event', () => {
    const xml=`<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" datamodel="ecmascript" initial="a"><datamodel><data id="seen" expr="''"/><data id="data" expr="0"/></datamodel><state id="a"><transition event="go" target="b"><assign location="seen" expr="_event.sendid"/><assign location="data" expr="_event.data.value"/></transition></state><state id="b"/></scxml>`;
    const simulator=new ScxmlSimulator(xml);simulator.initialize();
    const result=simulator.dispatch('go','scheduled',{sendid:'timer7',data:{value:42}}).snapshot;
    assert.strictEqual(result.dataModel.seen,'timer7');
    assert.strictEqual(result.dataModel.data,42);
  });
});
