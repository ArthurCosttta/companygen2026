import fs from 'fs';
import JSZip from 'jszip';

const html = fs.readFileSync('public/store-compiler/index.html', 'utf8');
const start = html.indexOf('<script id="cg-embedded-demos" type="application/json">');
const end = html.indexOf('</script>', start);
const jsonStr = html.substring(start + '<script id="cg-embedded-demos" type="application/json">'.length, end);
const demos = JSON.parse(jsonStr);

console.log('Available demo keys:', Object.keys(demos));
const ku = demos['KU_MODA'];
console.log('Demo KU_MODA name:', ku.name);

// Let's decode base64
const buf = Buffer.from(ku.data, 'base64');
const zip = await JSZip.loadAsync(buf);
console.log('Zip files:', Object.keys(zip.files));
