// compress.js - Rule-based compression utilities for Jymp
import uglify from 'uglify-js';
import stripComments from 'strip-comments';

export function compressContent(content, ext) {
  // Step 1: Strip comments (works for JS, CSS, HTML, etc.)
  try {
    content = stripComments(content);
  } catch {}

  // Step 2: Minify based on file type
  if (ext === '.js') {
    const minified = uglify.minify(content, {
      compress: true,
      mangle: false
    });
    if (!minified.error) {
      content = minified.code;
    }
  } else if (ext === '.json') {
    try {
      content = JSON.stringify(JSON.parse(content));
    } catch {}
  } else if (ext === '.html' || ext === '.css') {
    content = content.replace(/\s+/g, ' ').trim();
  }

  // Step 3: General optimizations for all text/code
  content = content.replace(/^\s*[\r\n]/gm, ''); // Remove blank lines
  content = content.replace(/\s+/g, ' '); // Collapse multiple spaces
  content = content.replace(/[.,;]{2,}/g, ''); // Remove redundant punctuation
  content = content.trim();

  return content;
}
