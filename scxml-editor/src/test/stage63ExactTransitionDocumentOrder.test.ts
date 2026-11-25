import * as assert from 'assert';
import { ScxmlSimulator } from '../simulator';

suite('Stage 63 exact transition document ordering', () => {
  test('does not use a fixed transition-index multiplier', () => {
    const source = require('fs').readFileSync(require('path').join(__dirname, '..', 'simulator.ts'), 'utf8');
    assert.ok(source.includes('sourceOrder:this.documentOrder(source.id)'));
    assert.ok(source.includes('a.sourceOrder-b.sourceOrder||a.index-b.index'));
    assert.ok(!source.includes('*10000+index'));
  });

  test('earlier source state wins even after more than 10000 preceding transitions', () => {
    const skipped = Array.from({length:10001}, (_, index) => `<transition event="skip${index}" target="winner"/>`).join('');
    const xml = `<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" initial="p"><parallel id="p"><state id="first">${skipped}<transition event="go" target="winner"/></state><state id="second"><transition event="go" target="loser"/></state></parallel><final id="winner"/><final id="loser"/></scxml>`;
    const simulator = new ScxmlSimulator(xml);
    simulator.initialize();
    const result = simulator.dispatch('go').snapshot;
    assert.deepStrictEqual(result.active, ['winner']);
    assert.ok(result.trace.some(item => item.message.includes('first transition 10002 wins before second transition 1')));
  });

  test('retains transition order within one source state', () => {
    const xml = `<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" initial="a"><state id="a"><transition event="go" cond="false" target="fail"/><transition event="go" target="pass"/></state><final id="pass"/><final id="fail"/></scxml>`;
    const simulator = new ScxmlSimulator(xml);
    simulator.initialize();
    assert.deepStrictEqual(simulator.dispatch('go').snapshot.active, ['pass']);
  });
});
