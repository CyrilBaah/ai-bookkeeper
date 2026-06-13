# Bookkeeping Skill

## Description
Record, categorize, query, and export personal expenses and income. Supports both text-based entry and receipt parsing.

## Triggers
bookkeeping, expense, income, spending, receipt, budget, categories, expenses, track spending, how much did I spend, record expense, add income, export expenses, CSV export, financial summary

## Capabilities

### 1. Record an Expense or Income
Parse natural language or structured input, infer the category, and save to `memory/expenses.json`.

**Input examples:**
- *"I spent $45 on Uber yesterday"*
- *"Record $120 electricity bill"*
- *"Got $2000 freelance payment"*

**Process:**
1. Extract: amount, description, date (default today), source
2. Infer category from vendor/description keywords
3. Generate UUID for `id`
4. Append to `memory/expenses.json`
5. Confirm: *"Recorded: $45.00 Transport — Uber ride"*

### 2. Parse Receipts
When given a receipt image or text:
1. Extract vendor name, total amount, date, line items
2. Create one transaction for the total amount
3. Store line items in the `description` field
4. Infer category from vendor

### 3. Query Transactions
- **By category:** *"How much on Food & Dining this month?"*
- **By amount filter:** *"Show expenses over $100"*
- **By date range:** *"What did I spend in May?"*
- **Running totals:** *"Totals by category"*
- **Balance:** *"What's my net income vs expenses this month?"*

### 4. Export to CSV
Generate a CSV with columns: `id,type,amount,currency,category,description,date,tags,source,createdAt`

Write to project root as `expenses-export-[YYYY-MM-DD].csv`.

### 5. Manage Facts
Store user preferences, recurring expenses, budget limits in `memory/facts.json`:
- *"Set a $500 monthly budget for Food & Dining"*
- *"I pay rent on the 1st every month"*
- *"My gym membership is $30/month"*

## Category Keywords (for inference)

| Category | Keywords |
|---|---|
| Food & Dining | grocery, restaurant, coffee, delivery, food, starbucks, whole foods, mcdonalds |
| Transport | uber, lyft, gas, transit, parking, flight, airline, train, subway |
| Utilities | electricity, water, internet, phone bill, cable, electric, water bill |
| Entertainment | netflix, spotify, movie, game, event, concert, streaming, hobby |
| Shopping | clothing, amazon, electronics, clothes, home, gift, retail |
| Health | gym, medication, doctor, insurance, pharmacy, dental, therapy |
| Education | book, course, tuition, subscription, class, learning, udemy |
| Income/Salary | salary, paycheck, wage, payroll |
| Freelance/Other Income | freelance, gig, contract, investment, refund, side hustle |

## Storage Paths
- Transactions: `memory/expenses.json` (relative to agent-home)
- Facts & preferences: `memory/facts.json`
- Settings: `settings.json`
