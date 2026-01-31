---
name: converting-html-to-pdf
description: Converts multiple HTML files into a single PDF using pandoc. Use when asked to merge HTML pages into PDF, create a PDF book from HTML, or fix PDF generation issues.
---

# Converting HTML to PDF

Converts a collection of downloaded HTML files into a single PDF document using pandoc and xelatex.

## Prerequisites

- `pandoc` installed
- A TeX engine (xelatex recommended)
- Node.js for preprocessing scripts

## Workflow

### 1. Merge HTML Files

Create a merge script that combines all HTML files in the correct order:

```javascript
// merge_html.js
const fs = require('fs');
const path = require('path');

// List HTML files in order (customize based on naming convention)
const files = fs.readdirSync('.')
  .filter(f => f.endsWith('.html') && !f.includes('merged'))
  .sort();

let merged = '';
for (const file of files) {
  merged += fs.readFileSync(file, 'utf8') + '\n';
}

fs.writeFileSync('merged.html', merged);
```

### 2. Preprocess HTML for Pandoc Compatibility

Many HTML patterns don't convert well to PDF. Create a preprocessing script to fix common issues:

```javascript
// preprocess_html.js
const fs = require('fs');

let html = fs.readFileSync('merged.html', 'utf8');

// Example: Convert table-based admonition blocks to blockquotes
html = html.replace(
  /<div class="admonitionblock (\w+)">\s*<table>[\s\S]*?<td class="content">([\s\S]*?)<\/td>[\s\S]*?<\/table>\s*<\/div>/g,
  (match, type, content) => {
    const label = type.charAt(0).toUpperCase() + type.slice(1);
    return `<blockquote><p><strong>${label}:</strong> ${content.trim()}</p></blockquote>`;
  }
);

fs.writeFileSync('preprocessed.html', html);
```

### 3. Generate PDF with Pandoc

```bash
pandoc "preprocessed.html" -o "output.pdf" \
  --pdf-engine=xelatex \
  -V geometry:margin=1in \
  --toc --toc-depth=3 \
  -V colorlinks=true \
  -V linkcolor=blue \
  -V urlcolor=blue
```

### 4. Validate Output (Iterative)

**This step is critical.** After generating the PDF, visually validate it:

1. Use `look_at` tool to examine the PDF and check for:
   - Missing content
   - Broken formatting
   - Garbled text from unconverted HTML elements
   - Layout issues

2. If issues are found:
   - Identify the problematic HTML patterns in the source
   - Add preprocessing rules to handle them
   - Regenerate the PDF
   - Validate again

3. Repeat until the PDF renders correctly.

## Common HTML Issues and Fixes

| Issue | HTML Pattern | Fix |
|-------|--------------|-----|
| Admonition blocks | `<div class="admonitionblock">` with tables | Convert to `<blockquote>` |
| Complex tables | Nested tables for layout | Flatten or convert to divs |
| Icon fonts | `<i class="fa-*">` | Remove or replace with text |
| SVG images | Inline SVG | Extract to files or remove |
| Custom components | Framework-specific elements | Convert to standard HTML |

## Makefile Template

```makefile
PDF_HTML := preprocessed.html
PDF_OUTPUT := output.pdf

.PHONY: pdf preprocess merge

merge:
	node merge_html.js

preprocess: merge
	node preprocess_html.js

pdf: preprocess
	pandoc "$(PDF_HTML)" -o "$(PDF_OUTPUT)" --pdf-engine=xelatex -V geometry:margin=1in --toc --toc-depth=3 -V colorlinks=true -V linkcolor=blue -V urlcolor=blue
```

## Validation Checklist

When examining the PDF output, check:

- [ ] Table of contents generated correctly
- [ ] All chapters/sections present
- [ ] Code blocks render with proper formatting
- [ ] Images display (or are acceptably absent)
- [ ] No raw HTML visible in text
- [ ] Blockquotes and callouts formatted nicely
- [ ] Links are clickable (blue text)
- [ ] Page breaks at reasonable locations
