# AI Bookkeeper

Personal finance assistant with an AI agent, web UI, and REST API. Track expenses and income, upload receipts with automatic OCR, and get spending insights — all from a single lightweight application.

## Features

- **Chat interface** — Record transactions with natural language (*"I spent $25 on lunch"*)
- **Receipt scanning** — Upload receipt images; OCR automatically extracts amount, vendor, and line items
- **Quick add form** — Manual entry with type, amount, category, date
- **Spending dashboard** — Summary cards, category breakdown bars, net balance
- **Filterable transaction log** — Filter by type, category, date range
- **CSV export** — Download all transactions as a CSV file
- **REST API** — Full CRUD for expenses, summaries, categories, and user facts

## Quick Start

```bash
npm install
npm run dev
```

Open **http://localhost:3000** in your browser.

## Project Structure

```
ai-bookkeeper/
├── agent-home/
│   ├── AGENTS.md                  # Agent overview and API reference
│   ├── settings.json              # Configuration: currency, categories, paths
│   ├── brain/
│   │   └── brain.md               # Agent instructions and transaction schema
│   ├── skills/
│   │   └── bookkeeping/
│   │       └── SKILL.md           # Bookkeeping skill definition
│   ├── memory/
│   │   ├── expenses.json          # Transaction log
│   │   └── facts.json             # User preferences, budgets, recurring expenses
│   ├── receipts/                  # Uploaded receipt images (auto-created)
│   └── sessions/                  # Runtime session state
├── public/
│   └── index.html                 # Frontend (vanilla HTML/CSS/JS)
├── src/
│   └── index.ts                   # Express server + API + OCR
├── package.json
└── tsconfig.json
```

## Usage

### Chat

Type naturally in the chat panel:

- *"I spent $45 on Uber yesterday"*
- *"Got $5000 salary payment"*
- *"Electricity bill was $120"*

The agent parses the amount, infers the category, and records the transaction.

### Receipt Upload

1. Drag and drop a receipt image (JPG, PNG, WEBP) onto the upload zone
2. OCR runs automatically via **Tesseract.js**
3. Preview shows the detected **total amount**, **vendor**, and **line items**
4. Click **"Log this expense"** to auto-fill the quick add form, then pick a category

### Quick Add

Use the form for manual entry with full control over type, amount, category, description, and date.

### Categories

**Expenses:** Food & Dining, Transport, Utilities, Entertainment, Shopping, Health, Education

**Income:** Income/Salary, Freelance/Other Income

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/expenses` | List transactions (filters: `type`, `category`, `minAmount`, `maxAmount`, `fromDate`, `toDate`) |
| `POST` | `/api/expenses` | Create a transaction |
| `DELETE` | `/api/expenses/:id` | Delete a transaction |
| `GET` | `/api/summary` | Totals by category (filters: `type`, `fromDate`, `toDate`) |
| `GET` | `/api/export/csv` | Download CSV export |
| `POST` | `/api/receipts` | Upload a receipt image (multipart, field: `receipt`) |
| `POST` | `/api/chat` | Send natural language message for parsing |
| `GET` | `/api/facts` | Get user preferences/facts |
| `PATCH` | `/api/facts` | Update user preferences/facts |
| `GET` | `/api/categories` | List available categories |

### Example: Record a transaction via API

```bash
curl -X POST http://localhost:3000/api/expenses \
  -H "Content-Type: application/json" \
  -d '{
    "type": "expense",
    "amount": 25.00,
    "category": "Food & Dining",
    "description": "Lunch at Cafe Nero",
    "date": "2026-06-13"
  }'
```

### Example: Get monthly summary

```bash
curl "http://localhost:3000/api/summary?type=expense&fromDate=2026-06-01&toDate=2026-06-30"
```

## Configuration

Set the port via environment variable:

```bash
PORT=3001 npm run dev
```

Edit `agent-home/settings.json` to change currency, categories, or storage paths.

## Transaction Schema

```json
{
  "id": "uuid-v4",
  "type": "expense",
  "amount": 45.00,
  "currency": "USD",
  "category": "Transport",
  "description": "Uber ride to airport",
  "date": "2026-06-13",
  "tags": ["uber", "travel"],
  "source": "chat",
  "createdAt": "2026-06-13T14:00:00Z"
}
```

## Tech Stack

- **Backend:** Express.js + TypeScript
- **Frontend:** Vanilla HTML/CSS/JS (no framework)
- **OCR:** Tesseract.js v7
- **Storage:** JSON files (`agent-home/memory/`)
- **File uploads:** Multer

## Notes

- First OCR run downloads the Tesseract English language model (~4MB); subsequent runs are cached
- For best OCR results, use clear, well-lit receipt photos with legible text
- PDF receipt parsing is not yet supported (images only)
