# Invoice and Statement

This project provides a static UI for invoices and statements plus a lightweight Node.js API to manage invoice data, cash flow, and party statements.

## Getting started

```bash
npm install
npm run start
```

The server will start on `http://localhost:3000` by default and serves the static UI from the repo root.

## API overview

- `GET /api/health` — Health check.
- `GET /api/invoices?party=...&transactionType=...`
- `POST /api/invoices` — Create an invoice (requires `party`, `transactionType`, `date`).
- `GET /api/partywise-statement?party=...`
- `GET /api/cash-flow?from=YYYY-MM-DD&to=YYYY-MM-DD`
- `GET /api/parties`
- `GET /api/summary`

### Example payload

```json
{
  "party": "Gem Traders",
  "transactionType": "Sales",
  "date": "2026-01-06",
  "items": [
    {
      "lotNo": "LOT 65",
      "description": "Brilliant cut",
      "pcs": 2,
      "cts": 1.5,
      "price": 1200
    }
  ],
  "remarks": "Priority client"
}
```

## Deployment

This service runs on any Node.js 18+ environment. Set `PORT` to override the default port.

Example (Render/Heroku-style):

```bash
PORT=8080 npm start
```

### Bolt publish (static UI only)

Bolt expects a build step to generate static assets to publish. This repo now creates a `dist/`
folder that contains the UI:

```bash
npm run build
```

Then publish the `dist/` folder as the output. Note that this publishes only the static UI;
the API in `server.js` still requires a Node-hosted environment.
