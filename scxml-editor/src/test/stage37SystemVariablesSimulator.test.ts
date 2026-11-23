import * as assert from 'assert';
import { ScxmlSimulator } from '../simulator';

suite('Stage 37 SCXML system variables, _event, and In()', () => {
  test('exposes external event fields through _event', () => {
    const xml=`<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" datamodel="ecmascript" initial="a"><datamodel><data id="name" expr="''"/><data id="type" expr="''"/></datamodel><state id="a"><transition event="go" target="b"><assign location="name" expr="_event.name"/><assign location="type" expr="_event.type"/></transition></state><state id="b"/></scxml>`;
    const simulator=new ScxmlSimulator(xml); simulator.initialize();
    const result=simulator.dispatch('go').snapshot;
    assert.deepStrictEqual(result.active,['b']);
    assert.strictEqual(result.dataModel.name,'go');
    assert.strictEqual(result.dataModel.type,'external');
  });

  test('updates _event while draining raised internal events', () => {
    const xml=`<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" datamodel="ecmascript" initial="a"><datamodel><data id="seen" expr="''"/></datamodel><state id="a"><transition event="go" target="b"><raise event="next"/></transition></state><state id="b"><transition event="next" target="c"><assign location="seen" expr="_event.name + ':' + _event.type"/></transition></state><state id="c"/></scxml>`;
    const simulator=new ScxmlSimulator(xml); simulator.initialize();
    const result=simulator.dispatch('go').snapshot;
    assert.deepStrictEqual(result.active,['c']);
    assert.strictEqual(result.dataModel.seen,'next:internal');
  });

  test('supports In() for active atomic and ancestor states', () => {
    const xml=`<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" datamodel="ecmascript" initial="parent"><state id="parent" initial="child"><state id="child"><transition event="go" cond="In('parent') &amp;&amp; In('child')" target="done"/></state></state><state id="done"/></scxml>`;
    const simulator=new ScxmlSimulator(xml); simulator.initialize();
    assert.deepStrictEqual(simulator.dispatch('go').snapshot.active,['done']);
  });

  test('provides stable session, chart name, and I/O processor variables', () => {
    const xml=`<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" name="Machine" datamodel="ecmascript" initial="a"><datamodel><data id="session" expr="_sessionid"/><data id="chart" expr="_name"/><data id="location" expr="_ioprocessors.scxml.location"/></datamodel><state id="a"/></scxml>`;
    const result=new ScxmlSimulator(xml).initialize().snapshot;
    assert.match(String(result.dataModel.session),/^scxml-\d+$/);
    assert.strictEqual(result.dataModel.chart,'Machine');
    assert.strictEqual(result.dataModel.location,`#_scxml_${result.dataModel.session}`);
  });

  test('internal send populates sendid and SCXML origin metadata', () => {
    const xml=`<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" datamodel="ecmascript" initial="a"><datamodel><data id="sendid" expr="''"/><data id="origin" expr="''"/></datamodel><state id="a"><onentry><send id="request1" event="next" target="#_internal"/></onentry><transition event="next" target="b"><assign location="sendid" expr="_event.sendid"/><assign location="origin" expr="_event.origin"/></transition></state><state id="b"/></scxml>`;
    const result=new ScxmlSimulator(xml).initialize().snapshot;
    assert.deepStrictEqual(result.active,['b']);
    assert.strictEqual(result.dataModel.sendid,'request1');
    assert.match(String(result.dataModel.origin),/^#_scxml_scxml-\d+$/);
  });
});
