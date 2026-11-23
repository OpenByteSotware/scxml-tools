import * as assert from 'assert';
import { parseScxml } from '../scxml';

suite('Parallel history region validation regression', () => {
  test('does not treat a direct history child as a parallel region', () => {
    const xml = `<scxml datamodel="ecmascript" xmlns="http://www.w3.org/2005/07/scxml" version="1.0" initial="a"><state id="a"><transition target="p" event="t1"/><transition target="h" event="t4"/></state><parallel id="p"><history id="h" type="deep"><transition target="b"/></history><state id="b" initial="b1"><state id="b1"/><state id="b2"/></state><state id="c" initial="c1"><state id="c1"/><state id="c2"/></state><transition target="a" event="t3"/></parallel></scxml>`;
    const model = parseScxml(xml);
    assert.ok(!model.problems.some(problem => problem.message === 'Parallel state p region h must be a state.'), JSON.stringify(model.problems));
    assert.ok(!model.problems.some(problem => problem.code === 'behavior.parallel' && /region h/.test(problem.message)), JSON.stringify(model.problems));
  });

  test('history does not inflate the minimum parallel-region count', () => {
    const xml = `<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" initial="p"><parallel id="p"><history id="h"><transition target="r"/></history><state id="r"/></parallel></scxml>`;
    const model = parseScxml(xml);
    assert.ok(model.problems.some(problem => problem.code === 'behavior.parallel' && /at least two regions/.test(problem.message)), JSON.stringify(model.problems));
  });
});
