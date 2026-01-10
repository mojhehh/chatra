const fs = require('fs');
const path = require('path');
const glob = require('glob');
const strip = require('strip-comments');
// NOTE: strip-json-comments v4+ is ESM-only. Pin to v3.x in package.json for CommonJS compatibility
// If using v4+, change to: const stripJsonComments = (await import('strip-json-comments')).default;
let stripJsonComments;
try {
  const stripJsonCommentsModule = require('strip-json-comments');
  stripJsonComments = stripJsonCommentsModule && (stripJsonCommentsModule.default || stripJsonCommentsModule);
  
  // Validate that stripJsonComments is actually a function
  if (typeof stripJsonComments !== 'function') {
    console.error('strip-json-comments loaded but is not a function.');
    console.error('Received type:', typeof stripJsonComments);
    console.error('Module shape:', Object.keys(stripJsonCommentsModule || {}).join(', ') || '(empty or null)');
    console.error('This may indicate an incompatible version. Install strip-json-comments@3.x for CommonJS support.');
    console.error('Run: npm install strip-json-comments@3');
    process.exit(1);
  }
} catch (e) {
  console.error('Failed to load strip-json-comments. Ensure strip-json-comments@3.x is installed for CommonJS support.');
  console.error('Run: npm install strip-json-comments@3');
  process.exit(1);
}

if (!fs.existsSync(path.join(process.cwd(), 'package.json'))) {
  console.error('Run this from the project root (package.json not found)');
  process.exit(1);
}

const patterns = ['**/*.js','**/*.css','**/*.html','**/*.json'];
const ignore = ['node_modules/**','.git/**','backup_before_strip.zip','chatra_backup_before_strip.zip','remove-comments.js','package.json','package-lock.json'];

function processFile(file) {
  try {
    const src = fs.readFileSync(file, 'utf8');
    const ext = path.extname(file).toLowerCase();
    let out;
    if (ext === '.json') {
      out = stripJsonComments(src);
    } else {
      out = strip(src, { language: ext.slice(1) || 'js' });
    }
    if (out !== src) {
      fs.writeFileSync(file, out, 'utf8');
      console.log('stripped', file);
    }
  } catch (e) {
    console.error('failed', file, e.message);
  }
}

patterns.forEach(pat => {
  try {
    const files = glob.sync(pat, { ignore });
    files.forEach(f => {
      if (f.includes('node_modules') || f.includes('.git')) return;
      processFile(f);
    });
  } catch (err) {
    console.error('glob error', err);
  }
});
