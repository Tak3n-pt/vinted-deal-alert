import { cpSync, readFileSync, writeFileSync, mkdirSync } from 'fs';

mkdirSync('dist/dashboard', { recursive: true });

cpSync('dashboard/public', 'dist/dashboard', { recursive: true });

let html = readFileSync('demo-clone/index.html', 'utf8');
html = html.replace(/https:\/\/bootstrapdemos\.wrappixel\.com\/materialpro\/dist\/assets\//g, '/assets/');
writeFileSync('dist/dashboard/index.html', html);

console.log('[build-static] done');
