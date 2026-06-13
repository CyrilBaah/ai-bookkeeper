# AI Bookkeeper Agent

## Purpose
Personal finance assistant. Tracks expenses and income, organizes transactions by category, answers spending queries, and exports reports.

## How to Use
Chat naturally:
- *"I spent $45 on Uber yesterday"*
- *"How much did I spend on food this month?"*
- *"Show expenses over $100"*
- *"Export to CSV"*

## API Endpoints (Secondary)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/expenses` | List transactions (filter: `type`, `category`, `minAmount`, `maxAmount`, `fromDate`, `toDate`) |
| POST | `/api/expenses` | Record a new transaction |
| DELETE | `/api/expenses/:id` | Delete a transaction |
| GET | `/api/summary` | Totals by category (filter: `type`, `fromDate`, `toDate`) |
| GET | `/api/export/csv` | Export all transactions to CSV |
| GET | `/api/facts` | Get user preferences/facts |
| PATCH | `/api/facts` | Update user preferences/facts |
| GET | `/api/categories` | List available categories |

## Structure
```
agent-home/
├── AGENTS.md          # This file
├── settings.json      # Agent config, categories, storage paths
├── brain/
│   └── brain.md       # Agent instructions and transaction schema
├── skills/
│   └── bookkeeping/
│       └── SKILL.md   # Bookkeeping skill definition
├── memory/
│   ├── expenses.json  # Transaction log
│   └── facts.json     # User preferences, budgets, recurring
└── sessions/          # Session state
```
