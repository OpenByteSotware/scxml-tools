import * as assert from 'assert';
import { ScxmlSimulator } from '../simulator';

suite('Stage 69 invocation cancellation and late-event isolation', () => {
  test('suppresses queued done.invoke after the owner exits first', () => {
    const xml = `<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" initial="work"><state id="work"><onentry><raise event="leave"/></onentry><invoke id="child"><content><scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" initial="done"><final id="done"/></scxml></content></invoke><transition event="leave" target="outside"/><transition event="done.invoke.child" target="fail"/></state><state id="outside"/><final id="fail"/></scxml>`;
    const snapshot = new ScxmlSimulator(xml).initialize().snapshot;
    assert.deepStrictEqual(snapshot.active, ['outside']);
    assert.ok(!snapshot.trace.some(item => item.message === 'Internal event: done.invoke.child'));
  });

  test('suppresses a late scheduled effect from a cancelled child session', () => {
    const child = `<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" initial="wait"><state id="wait"><onentry><send id="late" event="late" delay="1s"/></onentry></state></scxml>`;
    const parent = `<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" initial="work"><state id="work"><invoke id="child" src="child.scxml"/><transition event="leave" target="outside"/></state><state id="outside"><transition event="error.communication" target="fail"/></state><final id="fail"/></scxml>`;
    const simulator = new ScxmlSimulator(parent, { resolveInvoke: () => child });
    const initial = simulator.initialize();
    const effect = initial.effects.find(item => item.kind === 'send');
    assert.ok(effect && effect.kind === 'send');
    simulator.dispatch('leave');
    const late = simulator.deliverScheduled(effect as any).snapshot;
    assert.deepStrictEqual(late.active, ['outside']);
    assert.ok(late.trace.some(item => item.message.includes('Suppressed late scheduled event late')));
    assert.ok(!late.trace.some(item => item.event === 'error.communication' && item.kind === 'scheduled'));
  });

  test('invoke ID reuse does not accept a stale completion generation', () => {
    const xml = `<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" initial="first"><state id="first"><onentry><raise event="next"/></onentry><invoke id="worker"><content><scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" initial="done"><final id="done"/></scxml></content></invoke><transition event="next" target="second"/></state><state id="second"><invoke id="worker"><content><scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" initial="wait"><state id="wait"/></scxml></content></invoke><transition event="done.invoke.worker" target="fail"/></state><final id="fail"/></scxml>`;
    const snapshot = new ScxmlSimulator(xml).initialize().snapshot;
    assert.deepStrictEqual(snapshot.active, ['second']);
  });
});
