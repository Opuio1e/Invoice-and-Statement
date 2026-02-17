const express = require("express");
const morgan = require("morgan");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

const APP_PAGES = [
  "/",
  "/invoice-ui",
  "/saved-lists",
  "/invoice-report",
  "/cash-flow",
  "/partywise-statement",
  "/client-ledger",
];

app.use(express.json({ limit: "1mb" }));
app.use(morgan("tiny"));

const dataStore = {
  invoices: [],
  parties: new Map(),
};

const calculateInvoiceTotals = (items) => {
  const totals = items.reduce(
    (acc, item) => {
      const pcs = Number(item.pcs || 0);
      const cts = Number(item.cts || 0);
      const price = Number(item.price || 0);
      const amount = Number(item.amount ?? cts * price);
      acc.totalPcs += pcs;
      acc.totalCts += cts;
      acc.totalAmount += amount;
      return acc;
    },
    { totalPcs: 0, totalCts: 0, totalAmount: 0 }
  );

  totals.averagePrice = totals.totalCts ? totals.totalAmount / totals.totalCts : 0;
  return totals;
};


const getStatementTransactionColumns = (transactionType, amount) => {
  const normalizedType = String(transactionType || "").trim().toLowerCase();
  const creditTypes = ["purchase", "payment", "receipt", "credit", "return"];
  const isCredit = creditTypes.some((type) => normalizedType.includes(type));
  return {
    debit: isCredit ? 0 : amount,
    credit: isCredit ? amount : 0,
  };
};

const calculatePartyBalances = (invoices) => {
  const balances = new Map();
  invoices.forEach((invoice) => {
    const amount = invoice.totals.totalAmount;
    const current = balances.get(invoice.party) || 0;
    balances.set(invoice.party, current + amount);
  });
  return balances;
};

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", time: new Date().toISOString() });
});

app.get("/api/invoices", (req, res) => {
  const { party, transactionType } = req.query;
  const filtered = dataStore.invoices.filter((invoice) => {
    if (party && invoice.party !== party) return false;
    if (transactionType && invoice.transactionType !== transactionType) return false;
    return true;
  });
  res.json({ invoices: filtered });
});

app.post("/api/invoices", (req, res) => {
  const {
    party,
    transactionType,
    date,
    items = [],
    remarks,
  } = req.body;

  if (!party || !transactionType || !date) {
    return res.status(400).json({
      error: "party, transactionType, and date are required.",
    });
  }

  const totals = calculateInvoiceTotals(items);
  const invoiceNumber = `INV-${new Date(date).toISOString().slice(0, 10)}-${String(
    dataStore.invoices.length + 1
  ).padStart(4, "0")}`;

  const invoice = {
    id: dataStore.invoices.length + 1,
    invoiceNumber,
    party,
    transactionType,
    date,
    items,
    totals,
    remarks: remarks || "",
  };

  dataStore.invoices.push(invoice);
  dataStore.parties.set(party, true);

  res.status(201).json({ invoice });
});

app.get("/api/partywise-statement", (req, res) => {
  const { party, from, to } = req.query;
  if (!party) {
    return res.status(400).json({ error: "party query param is required." });
  }

  const fromDate = from ? new Date(from) : null;
  const toDate = to ? new Date(to) : null;

  const invoices = dataStore.invoices
    .filter((invoice) => {
      if (invoice.party !== party) return false;
      const invoiceDate = new Date(invoice.date);
      if (fromDate && invoiceDate < fromDate) return false;
      if (toDate && invoiceDate > toDate) return false;
      return true;
    })
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  let runningBalance = 0;
  const statement = invoices.map((invoice) => {
    const amount = invoice.totals.totalAmount;
    const { debit, credit } = getStatementTransactionColumns(invoice.transactionType, amount);
    runningBalance += debit - credit;
    return {
      date: invoice.date,
      refNo: invoice.invoiceNumber,
      description: invoice.transactionType,
      debit,
      credit,
      balance: runningBalance,
    };
  });

  res.json({ party, statement });
});

app.get("/api/client-ledger", (req, res) => {
  const party = String(req.query.party || req.query.client || "").trim();
  if (!party) {
    return res.status(400).json({ error: "party (or client) query param is required." });
  }

  const fromDate = req.query.from ? new Date(req.query.from) : null;
  const toDate = req.query.to ? new Date(req.query.to) : null;

  if (fromDate && Number.isNaN(fromDate.getTime())) {
    return res.status(400).json({ error: "from must be a valid date." });
  }

  if (toDate && Number.isNaN(toDate.getTime())) {
    return res.status(400).json({ error: "to must be a valid date." });
  }

  const rows = dataStore.invoices
    .filter((invoice) => {
      if (invoice.party !== party) return false;
      const invoiceDate = new Date(invoice.date);
      if (fromDate && invoiceDate < fromDate) return false;
      if (toDate && invoiceDate > toDate) return false;
      return true;
    })
    .sort((a, b) => {
      const dateDiff = new Date(a.date) - new Date(b.date);
      if (dateDiff !== 0) return dateDiff;
      return String(a.invoiceNumber || "").localeCompare(String(b.invoiceNumber || ""));
    });

  let runningBalance = 0;
  const ledger = rows.map((invoice) => {
    const amount = Number(invoice.totals?.totalAmount || 0);
    const { debit, credit } = getStatementTransactionColumns(invoice.transactionType, amount);
    runningBalance += debit - credit;

    return {
      refNo: invoice.invoiceNumber,
      date: invoice.date,
      description: invoice.transactionType,
      debit,
      credit,
      balance: runningBalance,
    };
  });

  res.json({ party, ledger });
});

app.get("/api/cash-flow", (req, res) => {
  const { from, to, transactionType, party } = req.query;
  const fromDate = from ? new Date(from) : null;
  const toDate = to ? new Date(to) : null;
  const normalizedParty = String(party || "").trim().toLowerCase();

  const entries = dataStore.invoices
    .filter((invoice) => {
      const invoiceDate = new Date(invoice.date);
      if (fromDate && invoiceDate < fromDate) return false;
      if (toDate && invoiceDate > toDate) return false;
      if (transactionType && invoice.transactionType !== transactionType) return false;
      if (normalizedParty && !String(invoice.party || "").toLowerCase().includes(normalizedParty)) return false;
      return true;
    })
    .map((invoice) => ({
      date: invoice.date,
      party: invoice.party,
      type: invoice.transactionType,
      amount: invoice.totals.totalAmount,
      remarks: invoice.remarks || "",
    }));

  let balance = 0;
  const rows = entries.map((entry) => {
    balance += entry.amount;
    return { ...entry, balance };
  });

  res.json({ rows, balance });
});

app.get("/api/parties", (_req, res) => {
  res.json({ parties: Array.from(dataStore.parties.keys()) });
});

app.get("/api/summary", (_req, res) => {
  const balances = calculatePartyBalances(dataStore.invoices);
  const totals = calculateInvoiceTotals(
    dataStore.invoices.flatMap((invoice) => invoice.items)
  );

  res.json({
    invoiceCount: dataStore.invoices.length,
    totals,
    balances: Object.fromEntries(balances),
  });
});

app.use(express.static(path.join(__dirname)));


app.get(APP_PAGES, (_req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.use((req, res) => {
  res.status(404).json({ error: "Not found" });
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
