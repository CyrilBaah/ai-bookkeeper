import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import { readFileSync, writeFileSync } from 'fs';
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

const app = express();
const port = Number(process.env.PORT ?? 3000);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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

// --- Routes ---

app.get('/', (_req: Request, res: Response) => {
  res.json({ message: 'AI Bookkeeper is running' });
});

// List all transactions (with optional filters)
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

// Record a new transaction
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

// Delete a transaction by ID
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

// Summary: totals by category
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

// Export to CSV
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

// Facts (preferences, budgets, recurring)
app.get('/api/facts', (_req: Request, res: Response) => {
  res.json(readFacts());
});

app.put('/api/facts', (req: Request, res: Response) => {
  const data = req.body;
  writeFacts(data);
  res.json({ message: 'Facts updated', data });
});

app.patch('/api/facts', (req: Request, res: Response) => {
  const current = readFacts();
  const updated = { ...current, ...req.body };
  writeFacts(updated);
  res.json({ message: 'Facts patched', data: updated });
});

// Categories reference
app.get('/api/categories', (_req: Request, res: Response) => {
  res.json({ expenses: EXPENSE_CATEGORIES, income: INCOME_CATEGORIES });
});

app.listen(port, () => {
  console.log(`AI Bookkeeper server listening on port ${port}`);
});
