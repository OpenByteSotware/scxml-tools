import * as assert from 'assert';
import { ScxmlSimulator } from '../simulator';

suite('Stage 42 platform error events', () => {
  test('assignment failure queues error.execution and permits recovery', () => {
    const xml=`<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" datamodel="ecmascript" initial="a"><datamodel><data id="message" expr="''"/></datamodel><state id="a"><onentry><assign location="value" expr="missing + 1"/></onentry><transition event="error.execution" target="recovered"><assign location="message" expr="_event.data.message"/></transition></state><state id="recovered"/></scxml>`;
    const snapshot=new ScxmlSimulator(xml).initialize().snapshot;
    assert.deepStrictEqual(snapshot.active,['recovered']);
    assert.match(String(snapshot.dataModel.message),/Unknown variable missing/);
    assert.ok(snapshot.trace.some(item=>item.event==='error.execution'&&item.kind==='scheduled'));
  });

  test('unsupported send target queues error.communication with details', () => {
    const xml=`<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" datamodel="ecmascript" initial="a"><datamodel><data id="target" expr="''"/></datamodel><state id="a"><onentry><send event="go" target="https://example.invalid/processor"/></onentry><transition event="error.communication" target="failed"><assign location="target" expr="_event.data.target"/></transition></state><state id="failed"/></scxml>`;
    const snapshot=new ScxmlSimulator(xml).initialize().snapshot;
    assert.deepStrictEqual(snapshot.active,['failed']);
    assert.strictEqual(snapshot.dataModel.target,'https://example.invalid/processor');
    assert.ok(snapshot.trace.some(item=>item.message.includes('error.communication')));
  });

  test('condition failure becomes a platform event instead of throwing', () => {
    const xml=`<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" datamodel="ecmascript" initial="a"><state id="a"><transition event="go" cond="missing" target="bad"/><transition event="error.execution" target="recovered"/></state><state id="bad"/><state id="recovered"/></scxml>`;
    const simulator=new ScxmlSimulator(xml);simulator.initialize();
    const snapshot=simulator.dispatch('go').snapshot;
    assert.deepStrictEqual(snapshot.active,['recovered']);
    assert.ok(snapshot.trace.some(item=>item.event==='error.execution'));
  });

  test('unresolved invoke source queues error.communication', () => {
    const xml=`<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" initial="a"><state id="a"><invoke id="child" src="missing.scxml"/><transition event="error.communication" target="failed"/></state><state id="failed"/></scxml>`;
    const snapshot=new ScxmlSimulator(xml,{resolveInvoke:()=>undefined}).initialize().snapshot;
    assert.deepStrictEqual(snapshot.active,['failed']);
    assert.ok(snapshot.trace.some(item=>item.message.includes('invoke source missing.scxml could not be resolved')));
  });
});
