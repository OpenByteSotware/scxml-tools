import * as assert from 'assert';
import { ScxmlSimulator } from '../simulator';

suite('Stage 33 normative macrostep and internal queue', () => {
  test('drains raised internal events before returning stable', () => {
    const xml=`<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" initial="a"><state id="a"><transition event="go" target="b"><raise event="next"/></transition></state><state id="b"><transition event="next" target="c"/></state><state id="c"/></scxml>`;
    const simulator=new ScxmlSimulator(xml); simulator.initialize();
    const result=simulator.dispatch('go').snapshot;
    assert.deepStrictEqual(result.active,['c']);
    assert.ok(result.trace.some(item=>item.message==='Raised internal event next.'));
    assert.ok(result.trace.some(item=>item.message==='Internal event: next'));
  });

  test('eventless transitions run before queued internal events', () => {
    const xml=`<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" initial="a"><state id="a"><transition event="go" target="b"><raise event="next"/></transition></state><state id="b"><transition target="eventless"/><transition event="next" target="internal"/></state><state id="eventless"/><state id="internal"/></scxml>`;
    const simulator=new ScxmlSimulator(xml); simulator.initialize();
    assert.deepStrictEqual(simulator.dispatch('go').snapshot.active,['eventless']);
  });

  test('child transition preempts a conflicting ancestor transition', () => {
    const xml=`<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" initial="parent"><state id="parent" initial="child"><transition event="go" target="ancestorWin"/><state id="child"><transition event="go" target="childWin"/></state></state><state id="ancestorWin"/><state id="childWin"/></scxml>`;
    const simulator=new ScxmlSimulator(xml); simulator.initialize();
    assert.deepStrictEqual(simulator.dispatch('go').snapshot.active,['childWin']);
  });

  test('executes nonconflicting transitions in separate parallel regions together', () => {
    const xml=`<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" initial="p"><parallel id="p"><state id="r1" initial="a1"><state id="a1"><transition event="go" target="a2"/></state><state id="a2"/></state><state id="r2" initial="b1"><state id="b1"><transition event="go" target="b2"/></state><state id="b2"/></state></parallel></scxml>`;
    const simulator=new ScxmlSimulator(xml); simulator.initialize();
    assert.deepStrictEqual(simulator.dispatch('go').snapshot.active,['a2','b2']);
  });

  test('document order resolves unrelated transitions with intersecting exit sets', () => {
    const xml=`<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" initial="p"><parallel id="p"><state id="r1" initial="a"><state id="a"><transition event="go" target="winner"/></state></state><state id="r2" initial="b"><state id="b"><transition event="go" target="loser"/></state></state></parallel><state id="winner"/><state id="loser"/></scxml>`;
    const simulator=new ScxmlSimulator(xml); simulator.initialize();
    assert.deepStrictEqual(simulator.dispatch('go').snapshot.active,['winner']);
  });
});
