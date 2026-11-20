import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

suite('Stage 14 navigation reveal', () => {
  test('centers outline, breadcrumb, and property navigation targets in the chart', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'extension.ts'), 'utf8');
    assert.match(source, /revealRequest/);
    assert.match(source, /data-reveal-state/);
    assert.match(source, /reveal:true/);
    assert.match(source, /const revealChartElement=/);
    assert.match(source, /chartScroller\.scrollTo\(/);
    assert.match(source, /chartScroller\.clientWidth\/2/);
    assert.match(source, /chartScroller\.clientHeight\/2/);
    assert.match(source, /requestAnimationFrame\(\(\)=>requestAnimationFrame/);
    assert.match(source, /navigation-flash/);
  });
});
