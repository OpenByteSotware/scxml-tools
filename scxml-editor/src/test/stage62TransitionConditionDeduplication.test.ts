import * as assert from 'assert';
import { ScxmlSimulator } from '../simulator';

suite('Stage 62 transition-condition deduplication', () => {
  test('evaluates a shared ancestor condition only once per selection pass', () => {
    const xml=`<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" datamodel="ecmascript" initial="owner"><state id="owner"><parallel id="p"><state id="left"/><state id="right"/></parallel><transition event="go" cond="missingValue" target="fail"/><transition event="error.execution" target="pass"/></state><final id="pass"/><final id="fail"/></scxml>`;
    const simulator=new ScxmlSimulator(xml); simulator.initialize();
    const result=simulator.dispatch('go').snapshot;
    assert.deepStrictEqual(result.active,['pass']);
    assert.strictEqual(result.trace.filter(item=>item.kind==='error'&&item.event==='error.execution'&&item.message.includes('Condition missingValue')).length,1);
  });

  test('caches false conditions while continuing to the next transition', () => {
    const xml=`<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" datamodel="ecmascript" initial="owner"><state id="owner"><parallel id="p"><state id="left"/><state id="right"/></parallel><transition event="go" cond="false" target="fail"/><transition event="go" target="pass"/></state><final id="pass"/><final id="fail"/></scxml>`;
    const simulator=new ScxmlSimulator(xml); simulator.initialize();
    const result=simulator.dispatch('go').snapshot;
    assert.deepStrictEqual(result.active,['pass']);
    assert.strictEqual(result.trace.filter(item=>item.message==='Condition false: false').length,1);
  });

  test('starts a new condition cache for each selection pass', () => {
    const xml=`<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" datamodel="ecmascript" initial="owner"><state id="owner"><parallel id="p"><state id="left"/><state id="right"/></parallel><transition event="go" cond="false" target="fail"/></state><final id="fail"/></scxml>`;
    const simulator=new ScxmlSimulator(xml); simulator.initialize(); simulator.dispatch('go');
    const result=simulator.dispatch('go').snapshot;
    assert.strictEqual(result.trace.filter(item=>item.message==='Condition false: false').length,2);
  });
});
