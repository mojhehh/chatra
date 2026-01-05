const fs = require('fs');
const path = require('path');
const glob = require('glob');
const strip = require('strip-comments');
const stripJsonCommentsModule = require('strip-json-comments');
const stripJsonComments = stripJsonCommentsModule && (stripJsonCommentsModule.default || stripJsonCommentsModule);

if (!process.cwd()) {
  console.error('Run this from the project root');
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
