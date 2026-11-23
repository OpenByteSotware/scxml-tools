import * as assert from 'assert';
import { parseScxml } from '../scxml';
import { ScxmlSimulator } from '../simulator';

const siblingChart = `<?xml version="1.0" encoding="UTF-8"?>
<scxml datamodel="ecmascript" xmlns="http://www.w3.org/2005/07/scxml" initial="a" version="1.0">
  <state id="a"><transition target="b" event="t"><raise event="s"/></transition></state>
  <state id="b"><transition target="c" event="s"/></state>
  <state id="c"/>
</scxml>`;

suite('SCXML-root transition domain regression', () => {
  test('accepts external transitions between top-level siblings', () => {
    const model = parseScxml(siblingChart);
    assert.ok(!model.problems.some(item => item.code === 'behavior.transitionDomain'), JSON.stringify(model.problems));
    assert.ok(!model.errors.some(message => /no legal transition domain/.test(message)), model.errors.join('\n'));
  });

  test('simulator exits the old top-level state before entering its sibling', () => {
    const simulator = new ScxmlSimulator(siblingChart);
    assert.deepStrictEqual(simulator.initialize().snapshot.active, ['a']);
    assert.deepStrictEqual(simulator.dispatch('t').snapshot.active, ['c']);
  });

  test('retains compound-source internal descendant domains', () => {
    const xml = `<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" initial="parent"><state id="parent" initial="one"><state id="one"/><state id="two"/><transition type="internal" event="next" target="two"/></state></scxml>`;
    assert.ok(!parseScxml(xml).problems.some(item => item.code === 'behavior.internalTransition'));
  });
});
