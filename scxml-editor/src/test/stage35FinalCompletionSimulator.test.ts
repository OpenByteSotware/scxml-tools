import * as assert from 'assert';
import { ScxmlSimulator } from '../simulator';

suite('Stage 35 final completion and done.state events', () => {
  test('compound final queues done.state and reaches top-level final', () => {
    const xml=`<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" initial="work"><state id="work" initial="running"><state id="running"><transition event="finish" target="finished"/></state><final id="finished"/><transition event="done.state.work" target="success"/></state><final id="success"/></scxml>`;
    const simulator=new ScxmlSimulator(xml); simulator.initialize();
    const result=simulator.dispatch('finish').snapshot;
    assert.deepStrictEqual(result.active,['success']);
    assert.strictEqual(result.completed,true);
    assert.ok(result.trace.some(item=>item.event==='done.state.work'));
  });

  test('parallel completion waits for every region', () => {
    const xml=`<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" initial="p"><parallel id="p"><state id="r1" initial="a"><state id="a"><transition event="one" target="f1"/></state><final id="f1"/></state><state id="r2" initial="b"><state id="b"><transition event="two" target="f2"/></state><final id="f2"/></state><transition event="done.state.p" target="success"/></parallel><final id="success"/></scxml>`;
    const simulator=new ScxmlSimulator(xml); simulator.initialize();
    const first=simulator.dispatch('one').snapshot;
    assert.deepStrictEqual(first.active,['b','f1']);
    assert.ok(!first.trace.some(item=>item.event==='done.state.p'));
    const second=simulator.dispatch('two').snapshot;
    assert.deepStrictEqual(second.active,['success']);
    assert.strictEqual(second.completed,true);
  });

  test('nested compound completion emits inner then outer completion', () => {
    const xml=`<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" initial="outer"><state id="outer" initial="inner"><state id="inner" initial="run"><state id="run"><transition event="finish" target="innerFinal"/></state><final id="innerFinal"/><transition event="done.state.inner" target="outerFinal"/></state><final id="outerFinal"/><transition event="done.state.outer" target="success"/></state><final id="success"/></scxml>`;
    const simulator=new ScxmlSimulator(xml); simulator.initialize();
    const result=simulator.dispatch('finish').snapshot;
    assert.deepStrictEqual(result.active,['success']);
    assert.ok(result.trace.some(item=>item.event==='done.state.inner'));
    assert.ok(result.trace.some(item=>item.event==='done.state.outer'));
  });

  test('top-level final ignores later events and cancels pending sends', () => {
    const xml=`<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" initial="a"><state id="a"><onentry><send id="timer" event="timeout" delay="10s"/></onentry><transition event="finish" target="done"/></state><final id="done"/></scxml>`;
    const simulator=new ScxmlSimulator(xml); simulator.initialize();
    const completed=simulator.dispatch('finish');
    assert.strictEqual(completed.snapshot.completed,true);
    assert.deepStrictEqual(completed.snapshot.pending,[]);
    assert.ok(completed.effects.some(effect=>effect.kind==='cancel'&&effect.id==='timer'));
    const ignored=simulator.dispatch('again').snapshot;
    assert.deepStrictEqual(ignored.active,['done']);
    assert.ok(ignored.trace.some(item=>item.message==='Ignored external event again; the SCXML session is complete.'));
  });
});
