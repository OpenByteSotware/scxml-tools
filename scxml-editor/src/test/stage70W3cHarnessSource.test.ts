import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { parseArguments } from '../w3cRunner';
suite('Stage 70 W3C conformance harness', () => {
 test('registers the command and supported filters', () => {
  const pkg=JSON.parse(fs.readFileSync(path.join(__dirname,'..','..','package.json'),'utf8'));
  assert.match(pkg.scripts['test:w3c'],/w3cRunner/);
  const options=parseArguments(['--datamodel','ecmascript','--test','403','--range','400-450','--fail-fast']);
  assert.strictEqual(options.datamodel,'ecmascript'); assert.strictEqual(options.test,'403'); assert.deepStrictEqual(options.range,[400,450]); assert.strictEqual(options.failFast,true);
 });
 test('contains result classification and JSON output', () => {
  const source=fs.readFileSync(path.join(__dirname,'..','w3cRunner.ts'),'utf8');
  for(const token of ["'pass'|'fail'|'unsupported'|'skipped'|'harness-error'",'w3c-results','platformErrors','actualActive','pending'])assert.ok(source.includes(token),token);
 });
});
