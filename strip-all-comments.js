const fs = require('fs');
const path = require('path');

// Verify running from project root
if (!fs.existsSync(path.join(process.cwd(), 'package.json'))) {
  console.error('Run this from the project root');
  process.exit(1);
}

function removeJsComments(code) {
  const lines = code.split('\n');
  const result = [];
  let inMultiLine = false;
  let inTemplate = false; // Moved outside per-line loop to persist across lines
  let templateExprDepth = 0; // Moved outside per-line loop to persist across lines
  
  for (let line of lines) {
    let newLine = '';
    let i = 0;
    let inString = false;
    let stringChar = '';
    
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
      
      // Track template expression nesting
      if (inTemplate && templateExprDepth === 0 && line[i] === '$' && line[i+1] === '{') {
        templateExprDepth = 1;
        newLine += line[i] + line[i+1];
        i += 2;
        continue;
      }
      
      // Track closing braces in template expressions
      if (templateExprDepth > 0 && line[i] === '}') {
        templateExprDepth--;
        newLine += line[i];
        i++;
        continue;
      }
      
      // Track opening braces in template expressions (for nested objects/functions)
      if (templateExprDepth > 0 && line[i] === '{') {
        templateExprDepth++;
        newLine += line[i];
        i++;
        continue;
      }
      
      // Track template literals - check for escaped backticks
      if (line[i] === '`' && !inString) {
        // Count preceding backslashes to check if escaped
        let escapes = 0;
        let j = i - 1;
        while (j >= 0 && line[j] === '\\') { escapes++; j--; }
        if (escapes % 2 === 0) {
          // Not escaped, toggle template state
          inTemplate = !inTemplate;
          if (!inTemplate) templateExprDepth = 0; // Reset depth when exiting template
        }
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
      } else if (code[i] === stringChar) {
        // Count consecutive backslashes before this quote
        let backslashCount = 0;
        let j = i - 1;
        while (j >= 0 && code[j] === '\\') {
          backslashCount++;
          j--;
        }
        // Quote terminates string only if preceded by even number of backslashes
        if (backslashCount % 2 === 0) {
          inString = false;
        }
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
    // Create backup before modifying
    try {
      fs.writeFileSync(f + '.bak', content);
    } catch (backupErr) {
      console.log('Backup failed for', f, backupErr.message);
    }
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
    // Create backup before modifying
    try {
      fs.writeFileSync(f + '.bak', content);
    } catch (backupErr) {
      console.log('Backup failed for', f, backupErr.message);
    }
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
    // Create backup before modifying
    try {
      fs.writeFileSync(f + '.bak', content);
    } catch (backupErr) {
      console.log('Backup failed for', f, backupErr.message);
    }
    // First strip HTML comments
    let cleaned = removeHtmlComments(content);
    // Strip CSS comments inside <style> tags
    cleaned = cleaned.replace(/(<style[^>]*>)([\s\S]*?)(<\/style>)/gi, (m, openTag, inner, closeTag) => {
      return openTag + removeCssComments(inner) + closeTag;
    });
    // Strip JS comments inside <script> tags (only inline scripts)
    cleaned = cleaned.replace(/(<script(?![^>]*src)[^>]*>)([\s\S]*?)(<\/script>)/gi, (m, openTag, inner, closeTag) => {
      return openTag + removeJsComments(inner) + closeTag;
    });
    fs.writeFileSync(f, cleaned);
    console.log('HTML cleaned:', f);
  } catch(e) {
    console.log('Skip HTML:', f, e.message);
  }
});

console.log('Done!');
