import { readFileSync, writeFileSync } from 'fs';
let html = readFileSync('demo-clone/index.html', 'utf8');
html = html.replace(/https:\/\/bootstrapdemos\.wrappixel\.com\/materialpro\/dist\/assets\//g, '/assets/');
writeFileSync('dist/dashboard/index.html', html);
