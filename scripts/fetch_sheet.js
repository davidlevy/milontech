import fs from 'fs';
import path from 'path';
import https from 'https';

const SHEET_URL = 'https://docs.google.com/spreadsheets/d/1pr6A4_Uu6llwFa0_m5y3qL_-Xw4Z70jpITO0P0bjsFk/export?format=csv&gid=0';
const LOCAL_CSV_PATH = path.resolve('glossary.csv');
const JSON_OUTPUT_PATH = path.resolve('data/glossary.json');

// Ensure data directory exists
const dataDir = path.dirname(JSON_OUTPUT_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++; // skip next quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

function parseCSV(csvContent) {
  const lines = csvContent.split(/\r?\n/);
  const glossary = [];

  let isFirstRow = true;
  for (const line of lines) {
    if (!line.trim()) continue;
    if (isFirstRow) {
      isFirstRow = false;
      continue;
    }
    const columns = parseCSVLine(line);
    if (columns.length < 3) continue;

    const [
      category,
      hebrewTerm,
      englishTerm,
      englishDefinition,
      hebrewExample,
      transliteration,
      englishExampleTranslation,
      isNative,
      complexity
    ] = columns;

    // Skip headers or empty rows
    if (hebrewTerm === 'Column 2' || category === 'Column 1') continue;
    if (!hebrewTerm && !englishTerm) continue;

    glossary.push({
      category: category || 'General',
      hebrewTerm: hebrewTerm || '',
      englishTerm: englishTerm || '',
      englishDefinition: englishDefinition || '',
      hebrewExample: hebrewExample || '',
      transliteration: transliteration || '',
      englishExampleTranslation: englishExampleTranslation || '',
      isNative: isNative === 'TRUE',
      complexity: complexity || 'Medium'
    });
  }

  return glossary;
}

function fetchSheet(url = SHEET_URL) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      // Follow HTTP redirects
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        console.log(`Following redirect to: ${res.headers.location}`);
        res.resume(); // Clear the buffer to prevent Node.js socket hang
        fetchSheet(res.headers.location).then(resolve).catch(reject);
        return;
      }

      if (res.statusCode !== 200) {
        reject(new Error(`Failed to fetch sheet: HTTP status ${res.statusCode}`));
        return;
      }

      let data = [];
      res.on('data', (chunk) => data.push(chunk));
      res.on('end', () => {
        const buffer = Buffer.concat(data);
        resolve(buffer.toString('utf8'));
      });
    }).on('error', (err) => {
      reject(err);
    });
  });
}

async function main() {
  let csvContent = '';
  try {
    csvContent = await fetchSheet();
    console.log('Successfully fetched sheet data from Google Sheets.');
    // Cache it locally
    fs.writeFileSync(LOCAL_CSV_PATH, csvContent, 'utf8');
  } catch (error) {
    console.warn('Could not fetch from remote Google Sheet. Error:', error.message);
    console.log('Attempting to read local cached CSV...');
    if (fs.existsSync(LOCAL_CSV_PATH)) {
      csvContent = fs.readFileSync(LOCAL_CSV_PATH, 'utf8');
      console.log('Successfully read local CSV cache.');
    } else {
      console.error('No local CSV cache found. Cannot proceed.');
      process.exit(1);
    }
  }

  const glossary = parseCSV(csvContent);
  console.log(`Parsed ${glossary.length} glossary terms.`);
  
  fs.writeFileSync(JSON_OUTPUT_PATH, JSON.stringify(glossary, null, 2), 'utf8');
  console.log(`Saved database to ${JSON_OUTPUT_PATH}`);
}

main();
