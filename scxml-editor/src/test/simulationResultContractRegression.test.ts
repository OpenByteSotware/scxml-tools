import * as assert from 'assert';
import { ScxmlSimulator, SimulationResult } from '../simulator';

suite('SimulationResult contract regression', () => {
  test('all simulator state is exposed through snapshot', () => {
    const xml = `<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" initial="a"><state id="a"><transition event="go" target="b"/></state><state id="b"/></scxml>`;
    const simulator = new ScxmlSimulator(xml);
    const initialized: SimulationResult = simulator.initialize();
    assert.deepStrictEqual(initialized.snapshot.active, ['a']);
    assert.deepStrictEqual(simulator.dispatch('go').snapshot.active, ['b']);
  });
});
