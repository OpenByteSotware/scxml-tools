import * as assert from 'assert';
import { ScxmlSimulator } from '../simulator';

suite('Stage 64 ordered active configuration', () => {
  test('reports parallel atomic states in source document order rather than lexical ID order', () => {
    const xml = `<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" initial="p"><parallel id="p"><state id="zeta"/><state id="alpha"/><state id="middle"/></parallel></scxml>`;
    assert.deepStrictEqual(new ScxmlSimulator(xml).initialize().snapshot.active, ['zeta', 'alpha', 'middle']);
  });

  test('preserves mixed-kind source order through nested parallel entry', () => {
    const xml = `<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" initial="outside"><state id="outside"><transition event="go" target="leafZ"/></state><parallel id="outer"><state id="regionZ" initial="leafZ"><state id="leafZ"/></state><parallel id="regionA"><state id="leafA1"/><state id="leafA2"/></parallel></parallel></scxml>`;
    const simulator = new ScxmlSimulator(xml);
    simulator.initialize();
    assert.deepStrictEqual(simulator.dispatch('go').snapshot.active, ['leafZ', 'leafA1', 'leafA2']);
  });

  test('uses the same order in stable configuration trace output', () => {
    const xml = `<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" initial="p"><parallel id="p"><state id="secondByName"/><state id="firstByName"/></parallel></scxml>`;
    const snapshot = new ScxmlSimulator(xml).initialize().snapshot;
    assert.ok(snapshot.trace.some(item => item.message === 'Stable configuration: secondByName, firstByName'));
  });
});
