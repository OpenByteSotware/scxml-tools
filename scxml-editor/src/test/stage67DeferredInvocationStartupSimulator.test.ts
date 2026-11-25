import * as assert from 'assert';
import { ScxmlSimulator } from '../simulator';

suite('Stage 67 deferred invocation startup', () => {
  const child = `<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" initial="waiting"><state id="waiting"/></scxml>`;

  test('does not start an invocation owned by an eventless transient state', () => {
    let resolutions = 0;
    const xml = `<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" initial="transient"><state id="transient"><invoke id="child" src="child.scxml"/><transition target="stable"/></state><state id="stable"/></scxml>`;
    const snapshot = new ScxmlSimulator(xml, { resolveInvoke: () => { resolutions++; return child; } }).initialize().snapshot;
    assert.deepStrictEqual(snapshot.active, ['stable']);
    assert.strictEqual(resolutions, 0);
    assert.ok(!snapshot.trace.some(item => item.message.includes('Started invoked SCXML session')));
  });

  test('starts an invocation exactly once after its owner becomes stable', () => {
    let resolutions = 0;
    const xml = `<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" initial="stable"><state id="stable"><invoke id="child" src="child.scxml"/></state></scxml>`;
    const simulator = new ScxmlSimulator(xml, { resolveInvoke: () => { resolutions++; return child; } });
    simulator.initialize();
    simulator.dispatch('unused');
    assert.strictEqual(resolutions, 1);
  });

  test('suppresses invocation when owner onentry raises an event that exits it', () => {
    let resolutions = 0;
    const xml = `<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" initial="transient"><state id="transient"><onentry><raise event="leave"/></onentry><invoke id="child" src="child.scxml"/><transition event="leave" target="stable"/></state><state id="stable"/></scxml>`;
    const snapshot = new ScxmlSimulator(xml, { resolveInvoke: () => { resolutions++; return child; } }).initialize().snapshot;
    assert.deepStrictEqual(snapshot.active, ['stable']);
    assert.strictEqual(resolutions, 0);
  });

  test('processes immediate child completion before returning stable', () => {
    const xml = `<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" initial="work"><state id="work"><invoke id="child"><content><scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" initial="done"><final id="done"/></scxml></content></invoke><transition event="done.invoke.child" target="pass"/></state><final id="pass"/></scxml>`;
    const snapshot = new ScxmlSimulator(xml).initialize().snapshot;
    assert.strictEqual(snapshot.completed, true);
    assert.deepStrictEqual(snapshot.active, ['pass']);
  });

  test('does not resolve an invalid source for a transient invocation', () => {
    let resolutions = 0;
    const xml = `<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" initial="transient"><state id="transient"><invoke id="child" src="missing.scxml"/><transition target="stable"/></state><state id="stable"><transition event="error.communication" target="fail"/></state><final id="fail"/></scxml>`;
    const snapshot = new ScxmlSimulator(xml, { resolveInvoke: () => { resolutions++; return undefined; } }).initialize().snapshot;
    assert.deepStrictEqual(snapshot.active, ['stable']);
    assert.strictEqual(resolutions, 0);
    assert.ok(!snapshot.trace.some(item => item.event === 'error.communication'));
  });
});
