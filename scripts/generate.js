import fs from 'fs';
import path from 'path';

const DATA_PATH = path.resolve('data/glossary.json');
const TEMPLATE_PATH = path.resolve('src/templates/index.html');
const DIST_PATH = path.resolve('dist');

// Helper to copy directory recursively
function copyDirSync(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function generateHTML(glossary, template) {
  // Generate categories list
  const categories = [...new Set(glossary.map(item => item.category))].sort();
  
  // Render search filters/badges
  const categoryBadgesHtml = categories
    .map(cat => `<button class="category-badge" data-category="${cat}">${cat}</button>`)
    .join('\n');

  // Escape HTML entities to prevent breakage
  const escape = (str) => (str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

  // Translate complexity levels
  const getComplexityLabel = (comp) => {
    if (comp === 'Low') return 'קל';
    if (comp === 'High') return 'מורכב';
    return 'בינוני';
  };

  // Pre-render glossary cards for SEO and non-JS fallback (Sidebar Explorer)
  const cardsHtml = glossary
    .map((item, index) => {
      return `
      <div class="glossary-card" 
           data-id="${index}" 
           data-category="${escape(item.category)}" 
           data-term-he="${escape(item.hebrewTerm)}" 
           data-term-en="${escape(item.englishTerm)}"
           data-complexity="${escape(item.complexity)}">
        <div class="card-header">
          <div class="card-meta">
            <span class="card-category">${escape(item.category)}</span>
            <span class="card-origin ${item.isNative ? 'tag-native' : 'tag-heblish'}">${item.isNative ? 'Native' : 'Heblish'}</span>
            <span class="card-complexity tag-${item.complexity.toLowerCase()}">${getComplexityLabel(item.complexity)}</span>
          </div>
          <div class="card-title-row" dir="ltr">
            <h3 class="term-title">
              <span class="term-en-inline">${escape(item.englishTerm)}</span>
              <span class="term-he-inline" dir="rtl">${escape(item.hebrewTerm)}</span>
            </h3>
          </div>
          <div class="term-def-preview" dir="ltr">${escape(item.englishDefinition)}</div>
        </div>
      </div>`;
    })
    .join('\n');

  // Pre-render continuous detailed blocks for the main workspace pane
  const detailsHtml = glossary
    .map((item, index) => {
      return `
      <div class="detail-block" id="detail-term-${index}" data-id="${index}" data-category="${escape(item.category)}" data-complexity="${escape(item.complexity)}">
        <div class="detail-header-section">
          <div class="detail-meta">
            <div class="detail-tags">
              <span class="detail-category-tag">${escape(item.category)}</span>
              <span class="detail-origin-tag ${item.isNative ? 'tag-native' : 'tag-heblish'}">${item.isNative ? 'Native' : 'Heblish'}</span>
              <span class="detail-complexity-tag tag-${item.complexity.toLowerCase()}">${getComplexityLabel(item.complexity)}</span>
            </div>
            <button class="action-btn share-permalink-btn" data-term="${escape(item.englishTerm)}" title="Copy shareable link">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
              <span>העתק קישור</span>
            </button>
          </div>
          
          <div class="active-term-group" dir="ltr">
            <h2 class="active-term-title">
              <span class="active-term-he" dir="rtl">${escape(item.hebrewTerm)}</span>
              <span class="active-term-en">${escape(item.englishTerm)}</span>
            </h2>
            <p class="active-term-definition">${escape(item.englishDefinition)}</p>
          </div>
        </div>

        <div class="detail-body-section">
          ${item.hebrewExample ? `
            <div class="section-block">
              <h4 class="section-title">USAGE EXAMPLE // דוגמת שימוש</h4>
              <div class="context-usage">
                <p class="example-he" dir="rtl">"${escape(item.hebrewExample)}"</p>
                ${item.transliteration ? `<p class="example-translit" dir="ltr">${escape(item.transliteration)}</p>` : ''}
                ${item.englishExampleTranslation ? `<p class="example-en" dir="ltr">"${escape(item.englishExampleTranslation)}"</p>` : ''}
              </div>
            </div>
          ` : ''}
        </div>
      </div>`;
    })
    .join('\n');

  // Inject variables into template
  let output = template;
  output = output.replace('{{GLOSSARY_ITEMS}}', cardsHtml);
  output = output.replace('{{GLOSSARY_DETAILS}}', detailsHtml);
  output = output.replace('{{CATEGORY_BADGES}}', categoryBadgesHtml);
  
  // Inject the raw JSON database so frontend JS has access to it for search/filter and interactive features
  output = output.replace('{{GLOSSARY_JSON_DB}}', JSON.stringify(glossary));

  return output;
}

function main() {
  console.log('Starting static site generation...');

  if (!fs.existsSync(DATA_PATH)) {
    console.error(`Error: Database file not found at ${DATA_PATH}. Please run "npm run fetch" first.`);
    process.exit(1);
  }

  if (!fs.existsSync(TEMPLATE_PATH)) {
    console.error(`Error: Template file not found at ${TEMPLATE_PATH}.`);
    process.exit(1);
  }

  // Load database and template
  const glossary = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
  const template = fs.readFileSync(TEMPLATE_PATH, 'utf8');

  // Re-create dist folder
  if (fs.existsSync(DIST_PATH)) {
    fs.rmSync(DIST_PATH, { recursive: true, force: true });
  }
  fs.mkdirSync(DIST_PATH, { recursive: true });

  // Generate index.html
  const htmlContent = generateHTML(glossary, template);
  fs.writeFileSync(path.join(DIST_PATH, 'index.html'), htmlContent, 'utf8');
  console.log('Successfully generated index.html');

  // Copy assets
  const srcAssetsPath = path.resolve('src/assets');
  const distAssetsPath = path.join(DIST_PATH, 'assets');
  if (fs.existsSync(srcAssetsPath)) {
    copyDirSync(srcAssetsPath, distAssetsPath);
    console.log('Successfully copied assets directory');
  } else {
    console.warn('Warning: src/assets directory does not exist. CSS/JS files won\'t be copied.');
  }

  console.log(`Static site build completed! Output in: ${DIST_PATH}`);
}

main();
