import * as assert from 'assert';
import { ScxmlSimulator } from '../simulator';

suite('Stage 72 deferred runtime-error validation', () => {
  test('does not reject an invalid condition that is never evaluated', () => {
    const xml = `<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" datamodel="ecmascript" initial="safe"><state id="safe"><transition event="unused" cond="(" target="fail"/></state><final id="fail"/></scxml>`;
    const snapshot = new ScxmlSimulator(xml).initialize().snapshot;
    assert.deepStrictEqual(snapshot.active, ['safe']);
    assert.ok(!snapshot.trace.some(item => item.event === 'error.execution'));
  });

  test('reports an invalid condition as error.execution when selection evaluates it', () => {
    const xml = `<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" datamodel="ecmascript" initial="s"><state id="s"><transition event="go" cond="(" target="fail"/><transition event="error.execution" target="pass"/></state><final id="pass"/><final id="fail"/></scxml>`;
    const simulator = new ScxmlSimulator(xml);
    simulator.initialize();
    const snapshot = simulator.dispatch('go').snapshot;
    assert.deepStrictEqual(snapshot.active, ['pass']);
    assert.ok(snapshot.trace.some(item => item.message.includes('error.execution')));
  });

  test('defers invalid script syntax until the containing state is entered', () => {
    const xml = `<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" datamodel="ecmascript" initial="idle"><state id="idle"><transition event="go" target="work"/></state><state id="work"><onentry><script>if (</script></onentry><transition event="error.execution" target="pass"/></state><final id="pass"/></scxml>`;
    const simulator = new ScxmlSimulator(xml);
    const initial = simulator.initialize().snapshot;
    assert.deepStrictEqual(initial.active, ['idle']);
    assert.ok(!initial.trace.some(item => item.event === 'error.execution'));
    const entered = simulator.dispatch('go').snapshot;
    assert.deepStrictEqual(entered.active, ['pass']);
  });

  test('continues to reject non-runtime structural validation errors', () => {
    const xml = `<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" initial="missing"><state id="s"/></scxml>`;
    assert.throws(() => new ScxmlSimulator(xml), /Cannot simulate SCXML with validation errors/);
  });
});
