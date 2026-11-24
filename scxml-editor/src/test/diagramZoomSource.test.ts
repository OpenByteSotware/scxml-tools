import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
suite('Diagram zoom controls',()=>{
 test('provides persistent buttons and middle-button wheel zoom',()=>{const source=fs.readFileSync(path.join(__dirname,'..','extension.ts'),'utf8');for(const token of ['id="zoom-out"','id="zoom-in"','id="zoom-level"','chartZoom','applyChartZoom','middleZoomHeld','event.button===1',"addEventListener('wheel'",'{passive:false}','chartBaseWidth','chartBaseHeight'])assert.ok(source.includes(token),token);assert.ok(source.includes("Math.min(2,Math.max(.5"));assert.ok(source.includes("chartZoom+(event.deltaY<0?.1:-.1)"));});
});
