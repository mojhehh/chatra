const fs = require('fs');
const path = require('path');

function removeJsComments(code) {
  const lines = code.split('\n');
  const result = [];
  let inMultiLine = false;
  
  for (let line of lines) {
    let newLine = '';
    let i = 0;
    let inString = false;
    let stringChar = '';
    let inTemplate = false;
    
    while (i < line.length) {
      // Handle end of multi-line comment
      if (inMultiLine) {
        if (line[i] === '*' && line[i+1] === '/') {
          inMultiLine = false;
          i += 2;
          continue;
        }
        i++;
        continue;
      }
      
      // Track template literals
      if (line[i] === '`' && !inString) {
        inTemplate = !inTemplate;
        newLine += line[i];
        i++;
        continue;
      }
      
      // Track strings
      if ((line[i] === '"' || line[i] === "'") && !inTemplate) {
        if (!inString) {
          inString = true;
          stringChar = line[i];
        } else if (line[i] === stringChar) {
          // Check for escape
          let escapes = 0;
          let j = i - 1;
          while (j >= 0 && line[j] === '\\') { escapes++; j--; }
          if (escapes % 2 === 0) inString = false;
        }
        newLine += line[i];
        i++;
        continue;
      }
      
      // Check for comments outside strings
      if (!inString && !inTemplate) {
        // Single-line comment
        if (line[i] === '/' && line[i+1] === '/') {
          break; // Rest of line is comment
        }
        // Multi-line comment start
        if (line[i] === '/' && line[i+1] === '*') {
          // Look for end on same line
          let end = line.indexOf('*/', i + 2);
          if (end !== -1) {
            i = end + 2;
            continue;
          } else {
            inMultiLine = true;
            break;
          }
        }
      }
      
      newLine += line[i];
      i++;
    }
    
    result.push(newLine);
  }
  
  return result.join('\n');
}

function removeCssComments(code) {
  let result = '';
  let i = 0;
  let inString = false;
  let stringChar = '';
  
  while (i < code.length) {
    if ((code[i] === '"' || code[i] === "'")) {
      if (!inString) {
        inString = true;
        stringChar = code[i];
      } else if (code[i] === stringChar && code[i-1] !== '\\') {
        inString = false;
      }
      result += code[i];
      i++;
      continue;
    }
    
    if (!inString && code[i] === '/' && code[i+1] === '*') {
      i += 2;
      while (i < code.length && !(code[i] === '*' && code[i+1] === '/')) i++;
      i += 2;
      continue;
    }
    
    result += code[i];
    i++;
  }
  return result;
}

function removeHtmlComments(code) {
  return code.replace(/<!--[\s\S]*?-->/g, '');
}

const jsFiles = [
  'script.js',
  'reset.js',
  'cloudflare-worker/verify-email-worker.js',
  'cloudflare-worker/test-ai.js'
];

const cssFiles = ['style.css'];
const htmlFiles = ['index.html', 'chatra.html', 'reset.html'];

jsFiles.forEach(f => {
  try {
    const content = fs.readFileSync(f, 'utf8');
    const cleaned = removeJsComments(content);
    fs.writeFileSync(f, cleaned);
    console.log('JS cleaned:', f);
  } catch(e) {
    console.log('Skip JS:', f, e.message);
  }
});

cssFiles.forEach(f => {
  try {
    const content = fs.readFileSync(f, 'utf8');
    const cleaned = removeCssComments(content);
    fs.writeFileSync(f, cleaned);
    console.log('CSS cleaned:', f);
  } catch(e) {
    console.log('Skip CSS:', f, e.message);
  }
});

htmlFiles.forEach(f => {
  try {
    const content = fs.readFileSync(f, 'utf8');
    const cleaned = removeHtmlComments(content);
    fs.writeFileSync(f, cleaned);
    console.log('HTML cleaned:', f);
  } catch(e) {
    console.log('Skip HTML:', f, e.message);
  }
});

console.log('Done!');
