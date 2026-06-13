import express, { Request, Response } from 'express';
import multer from 'multer';
import dotenv from 'dotenv';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..');
const AGENT_HOME = join(ROOT, 'agent-home');
const EXPENSES_PATH = join(AGENT_HOME, 'memory', 'expenses.json');
const FACTS_PATH = join(AGENT_HOME, 'memory', 'facts.json');
const UPLOADS_DIR = join(AGENT_HOME, 'receipts');

if (!existsSync(UPLOADS_DIR)) mkdirSync(UPLOADS_DIR, { recursive: true });

const app = express();
const port = Number(process.env.PORT ?? 3000);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Multer config for receipt uploads
const storage = multer.diskStorage({
  destination: UPLOADS_DIR,
  filename: (_req, file, cb) => {
    const ts = Date.now().toString(36);
    const name = `${ts}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    cb(null, name);
  },
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

// --- Tesseract OCR (lazy-loaded) ---
let TesseractWorker: any = null;

async function ensureWorker() {
  if (TesseractWorker) return TesseractWorker;
  const { createWorker } = await import('tesseract.js');
  TesseractWorker = await createWorker('eng');
  // v7 workers come pre-loaded, no need to call .load()
  return TesseractWorker;
}

// --- Helpers ---

function readExpenses(): any[] {
  try {
    return JSON.parse(readFileSync(EXPENSES_PATH, 'utf-8'));
  } catch {
    return [];
  }
}

function writeExpenses(data: any[]) {
  writeFileSync(EXPENSES_PATH, JSON.stringify(data, null, 2));
}

function readFacts(): any {
  try {
    return JSON.parse(readFileSync(FACTS_PATH, 'utf-8'));
  } catch {
    return {};
  }
}

function writeFacts(data: any) {
  writeFileSync(FACTS_PATH, JSON.stringify(data, null, 2));
}

const EXPENSE_CATEGORIES = [
  'Food & Dining', 'Transport', 'Utilities', 'Entertainment',
  'Shopping', 'Health', 'Education',
];
const INCOME_CATEGORIES = ['Income/Salary', 'Freelance/Other Income'];

// OCR: run tesseract on an image and extract amount + line items
async function ocrReceipt(filePath: string): Promise<{
  totalAmount: number | null;
  vendor: string;
  lineItems: string[];
  rawText: string;
}> {
  const worker = await ensureWorker();
  const { data: { text } } = await worker.recognize(filePath);
  const lines = text.split('\n').map((l: string) => l.trim()).filter(Boolean);
  const fullText = lines.join(' ');

  // Extract the total — look for "Total", "Amount Due", "Grand Total" followed by a number
  let totalAmount: number | null = null;

  // Try: Total $20.28  or  TOTAL 20.28  or  TOTAL  2028 (OCR may lose the dot)
  const totalPattern = /(?:total|amount\s*due|grand\s*total|balance|net)\s*[:\s]*[\$]?\s*([\d,]+\.?[\d]*)/i;
  const totalMatch = fullText.match(totalPattern);
  if (totalMatch) {
    let raw = totalMatch[1].replace(/,/g, '');
    // If no decimal and exactly 2+ digits, last 2 are likely cents
    if (!raw.includes('.') && raw.length >= 2) {
      raw = raw.slice(0, -2) + '.' + raw.slice(-2);
    }
    totalAmount = parseFloat(raw);
    if (isNaN(totalAmount)) totalAmount = null;
  }

  // Fallback: find amounts with dots (e.g. $4.99) and take the largest
  if (!totalAmount) {
    const allAmounts = [...fullText.matchAll(/[\$]?\s*([\d,]+\.\d{2})/g)].map((m) =>
      parseFloat(m[1].replace(/,/g, ''))
    );
    if (allAmounts.length > 0) {
      totalAmount = Math.max(...allAmounts);
    }
  }

  // Second fallback: look for the line after "total" with any digits
  if (!totalAmount) {
    const totalLineIdx = lines.findIndex((l: string) => /total/i.test(l));
    if (totalLineIdx >= 0) {
      const digits = lines[totalLineIdx].match(/[\d,]+\.?[\d]*/);
      if (digits) {
        let raw = digits[0].replace(/,/g, '');
        if (!raw.includes('.') && raw.length >= 2) {
          raw = raw.slice(0, -2) + '.' + raw.slice(-2);
        }
        totalAmount = parseFloat(raw) || null;
      }
    }
  }

  // Vendor: first line that looks like a name (has letters, not just numbers)
  let vendor = '';
  for (const line of lines) {
    if (line.length > 2 && /[a-zA-Z]/.test(line) && !/^(total|amount|tax|cash|card|date|time|page|thank|page|void)/i.test(line)) {
      vendor = line;
      break;
    }
  }

  // Line items: lines that contain a number that looks like a price
  const lineItems: string[] = [];
  for (const line of lines) {
    const lineAmt = line.match(/[\$]?\s*([\d,]+\.?\d{2,})/);
    if (lineAmt && !/^(total|tax|due|balance|subtotal|\d{4}\/\d{2}\/\d{2}|receipt|page|void|thank|cash|card|visa|master)/i.test(line)) {
      lineItems.push(line);
    }
  }

  return { totalAmount, vendor, lineItems, rawText: fullText };
}

// Simple keyword-based category inference
function inferCategory(text: string): string {
  const lower = text.toLowerCase();
  const keywords: [string[], string][] = [
    [['grocery', 'restaurant', 'coffee', 'delivery', 'food', 'starbucks', 'whole foods', 'mcdonalds', 'uber eats', 'doordash', 'eat', 'lunch', 'dinner', 'breakfast'], 'Food & Dining'],
    [['uber', 'lyft', 'gas', 'transit', 'parking', 'flight', 'airline', 'train', 'subway', 'bus', 'taxi', 'airbnb', 'hotel'], 'Transport'],
    [['electricity', 'water', 'internet', 'phone bill', 'cable', 'electric', 'water bill', 'utility', 'comcast', 'verizon'], 'Utilities'],
    [['netflix', 'spotify', 'movie', 'game', 'event', 'concert', 'streaming', 'hobby', 'disney', 'hulu', 'ticket'], 'Entertainment'],
    [['clothing', 'amazon', 'electronics', 'clothes', 'home', 'gift', 'retail', 'nike', 'adidas', 'shop', 'buy'], 'Shopping'],
    [['gym', 'medication', 'doctor', 'insurance', 'pharmacy', 'dental', 'therapy', 'hospital', 'cvs', 'walgreens'], 'Health'],
    [['book', 'course', 'tuition', 'class', 'learning', 'udemy', 'coursera', 'edu', 'school', 'university'], 'Education'],
    [['salary', 'paycheck', 'wage', 'payroll'], 'Income/Salary'],
    [['freelance', 'gig', 'contract', 'investment', 'refund', 'side hustle', 'fiverr', 'upwork'], 'Freelance/Other Income'],
  ];
  for (const [words, category] of keywords) {
    for (const word of words) {
      if (lower.includes(word)) return category;
    }
  }
  return '';
}

// --- Frontend routes ---

app.get('/', (_req: Request, res: Response) => {
  try {
    const html = readFileSync(join(ROOT, 'public', 'index.html'), 'utf-8');
    res.send(html);
  } catch {
    res.status(500).json({ error: 'Frontend not found' });
  }
});

// Chat endpoint — parses natural language and records transactions
app.post('/api/chat', (req: Request, res: Response) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: 'message is required' });

  // Extract amount using regex
  const amountMatch = message.match(/[\$]?\s*([\d,]+\.?\d*)/);
  const amount = amountMatch ? parseFloat(amountMatch[1].replace(/,/g, '')) : null;

  // Infer type
  const lower = message.toLowerCase();
  const isIncome = /\b(income|salary|earned|paid|got|received|freelance|refund)\b/.test(lower);
  const isExpense = /\b(spent|cost|bought|paid for|bill|charge|purchase)\b/.test(lower) || (!isIncome && amount !== null);
  const type = isIncome ? 'income' : 'expense';

  // Infer category
  let category = inferCategory(message);
  if (!category) {
    category = isIncome ? 'Income/Salary' : 'Food & Dining';
  }

  // Extract date if mentioned
  const dateMatch = message.match(/(\d{4}-\d{2}-\d{2})/);
  const date = dateMatch ? dateMatch[1] : new Date().toISOString().split('T')[0];

  if (!amount) {
    return res.json({
      reply: "I couldn't detect an amount. Could you tell me how much?",
      transaction: null,
    });
  }

  const transaction = {
    id: randomUUID(),
    type,
    amount,
    currency: 'USD',
    category,
    description: message.trim(),
    date,
    tags: [],
    source: 'chat',
    createdAt: new Date().toISOString(),
  };

  const expenses = readExpenses();
  expenses.push(transaction);
  writeExpenses(expenses);

  const sign = type === 'income' ? '+' : '-';
  res.json({
    reply: `Recorded: ${sign}$${amount.toFixed(2)} ${category} — ${transaction.description}`,
    transaction,
  });
});

// --- API Routes ---

app.get('/api/expenses', (req: Request, res: Response) => {
  const { type, category, minAmount, maxAmount, fromDate, toDate } = req.query;
  let expenses = readExpenses();

  if (type) expenses = expenses.filter((e: any) => e.type === type);
  if (category) expenses = expenses.filter((e: any) => e.category === category);
  if (minAmount) expenses = expenses.filter((e: any) => e.amount >= Number(minAmount));
  if (maxAmount) expenses = expenses.filter((e: any) => e.amount <= Number(maxAmount));
  if (fromDate) expenses = expenses.filter((e: any) => e.date >= fromDate);
  if (toDate) expenses = expenses.filter((e: any) => e.date <= toDate);

  res.json({ count: expenses.length, expenses });
});

app.post('/api/expenses', (req: Request, res: Response) => {
  const { type, amount, category, description, date, tags, source } = req.body;

  if (!amount || !category) {
    return res.status(400).json({ error: 'amount and category are required' });
  }

  const transaction = {
    id: randomUUID(),
    type: type || 'expense',
    amount: Number(amount),
    currency: 'USD',
    category,
    description: description || '',
    date: date || new Date().toISOString().split('T')[0],
    tags: tags || [],
    source: source || 'api',
    createdAt: new Date().toISOString(),
  };

  const expenses = readExpenses();
  expenses.push(transaction);
  writeExpenses(expenses);

  res.status(201).json(transaction);
});

app.delete('/api/expenses/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  let expenses = readExpenses();
  const before = expenses.length;
  expenses = expenses.filter((e: any) => e.id !== id);

  if (expenses.length === before) {
    return res.status(404).json({ error: 'Transaction not found' });
  }

  writeExpenses(expenses);
  res.json({ message: 'Transaction deleted', id });
});

app.get('/api/summary', (req: Request, res: Response) => {
  const { type, fromDate, toDate } = req.query;
  let expenses = readExpenses();

  if (type) expenses = expenses.filter((e: any) => e.type === type);
  if (fromDate) expenses = expenses.filter((e: any) => e.date >= fromDate);
  if (toDate) expenses = expenses.filter((e: any) => e.date <= toDate);

  const totals: Record<string, number> = {};
  let totalAmount = 0;

  expenses.forEach((e: any) => {
    totals[e.category] = (totals[e.category] || 0) + e.amount;
    totalAmount += e.amount;
  });

  res.json({ byCategory: totals, total: totalAmount, count: expenses.length });
});

app.get('/api/export/csv', (_req: Request, res: Response) => {
  const expenses = readExpenses();
  const headers = ['id', 'type', 'amount', 'currency', 'category', 'description', 'date', 'tags', 'source', 'createdAt'];
  const csvRows = [headers.join(',')];

  expenses.forEach((e: any) => {
    const row = headers.map((h) => {
      const val = e[h];
      if (h === 'tags') return `"${(val || []).join('; ')}"`;
      if (typeof val === 'string' && val.includes(',')) return `"${val}"`;
      return val ?? '';
    });
    csvRows.push(row.join(','));
  });

  const dateStr = new Date().toISOString().split('T')[0];
  const csvContent = csvRows.join('\n');
  writeFileSync(join(ROOT, `expenses-export-${dateStr}.csv`), csvContent);

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename=expenses-export-${dateStr}.csv`);
  res.send(csvContent);
});

// Receipt upload — OCR extracts amount, vendor, line items; shows preview + auto-fills form
app.post('/api/receipts', upload.single('receipt'), async (req: Request, res: Response) => {
  const file = req.file;
  if (!file) return res.status(400).json({ error: 'No file uploaded' });

  const filePath = file.path;
  const isImage = /\.(jpe?g|png|webp)$/i.test(file.originalname);

  // If it's an image, run OCR. PDFs skip OCR for now (can add pdf-parse later).
  let ocrResult: any = null;
  if (isImage) {
    try {
      ocrResult = await ocrReceipt(filePath);
    } catch (err: any) {
      console.error('OCR error:', err.message);
    }
  }

  res.json({
    message: 'Receipt uploaded',
    filename: file.filename,
    originalName: file.originalname,
    size: file.size,
    ocr: ocrResult || null,
    // Serve a preview URL for images
    previewUrl: isImage ? `/receipts/${file.filename}` : null,
  });
});

// Serve uploaded receipts for preview
app.use('/receipts', express.static(UPLOADS_DIR));

app.get('/api/facts', (_req: Request, res: Response) => {
  res.json(readFacts());
});

app.patch('/api/facts', (req: Request, res: Response) => {
  const current = readFacts();
  const updated = { ...current, ...req.body };
  writeFacts(updated);
  res.json({ message: 'Facts patched', data: updated });
});

app.get('/api/categories', (_req: Request, res: Response) => {
  res.json({ expenses: EXPENSE_CATEGORIES, income: INCOME_CATEGORIES });
});

app.listen(port, () => {
  console.log(`AI Bookkeeper running at http://localhost:${port}`);
});
