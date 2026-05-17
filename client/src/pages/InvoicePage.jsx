import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import api from "../api";
import { useAuth } from "../context/AuthContext";

const formatTimestamp = (timestamp) => {
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString();
};

const getTimestampValue = (timestamp) => {
  const time = new Date(timestamp).getTime();
  return Number.isNaN(time) ? Number.MAX_SAFE_INTEGER : time;
};

const escapeXml = (value) =>
  String(value ?? "").replace(/[<>&'"]/g, (char) => {
    const entities = {
      "<": "&lt;",
      ">": "&gt;",
      "&": "&amp;",
      "'": "&apos;",
      '"': "&quot;",
    };
    return entities[char];
  });

const getExcelColumnName = (index) => {
  let name = "";
  let n = index + 1;
  while (n > 0) {
    const remainder = (n - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    n = Math.floor((n - 1) / 26);
  }
  return name;
};

const buildXlsxCell = (value, rowIndex, columnIndex) => {
  const cellRef = `${getExcelColumnName(columnIndex)}${rowIndex + 1}`;
  if (typeof value === "number" && Number.isFinite(value)) {
    return `<c r="${cellRef}"><v>${value}</v></c>`;
  }
  return `<c r="${cellRef}" t="inlineStr"><is><t>${escapeXml(value)}</t></is></c>`;
};

const getCrcTable = (() => {
  let table = null;
  return () => {
    if (table) return table;
    table = new Uint32Array(256);
    for (let i = 0; i < 256; i += 1) {
      let c = i;
      for (let j = 0; j < 8; j += 1) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }
      table[i] = c >>> 0;
    }
    return table;
  };
})();

const getCrc32 = (bytes) => {
  const table = getCrcTable();
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    crc = table[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
};

const getDosDateTime = () => {
  const now = new Date();
  return {
    time:
      (now.getHours() << 11) |
      (now.getMinutes() << 5) |
      Math.floor(now.getSeconds() / 2),
    date:
      ((now.getFullYear() - 1980) << 9) |
      ((now.getMonth() + 1) << 5) |
      now.getDate(),
  };
};

const createZipBlob = (files, type) => {
  const encoder = new TextEncoder();
  const { time, date } = getDosDateTime();
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  files.forEach((file) => {
    const nameBytes = encoder.encode(file.name);
    const contentBytes = encoder.encode(file.content);
    const crc = getCrc32(contentBytes);

    const localHeader = new Uint8Array(30 + nameBytes.length + contentBytes.length);
    const localView = new DataView(localHeader.buffer);
    let localOffset = 0;
    localView.setUint32(localOffset, 0x04034b50, true);
    localOffset += 4;
    localView.setUint16(localOffset, 20, true);
    localOffset += 2;
    localView.setUint16(localOffset, 0, true);
    localOffset += 2;
    localView.setUint16(localOffset, 0, true);
    localOffset += 2;
    localView.setUint16(localOffset, time, true);
    localOffset += 2;
    localView.setUint16(localOffset, date, true);
    localOffset += 2;
    localView.setUint32(localOffset, crc, true);
    localOffset += 4;
    localView.setUint32(localOffset, contentBytes.length, true);
    localOffset += 4;
    localView.setUint32(localOffset, contentBytes.length, true);
    localOffset += 4;
    localView.setUint16(localOffset, nameBytes.length, true);
    localOffset += 2;
    localView.setUint16(localOffset, 0, true);
    localOffset += 2;
    localHeader.set(nameBytes, localOffset);
    localOffset += nameBytes.length;
    localHeader.set(contentBytes, localOffset);
    localParts.push(localHeader);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(centralHeader.buffer);
    let centralOffset = 0;
    centralView.setUint32(centralOffset, 0x02014b50, true);
    centralOffset += 4;
    centralView.setUint16(centralOffset, 20, true);
    centralOffset += 2;
    centralView.setUint16(centralOffset, 20, true);
    centralOffset += 2;
    centralView.setUint16(centralOffset, 0, true);
    centralOffset += 2;
    centralView.setUint16(centralOffset, 0, true);
    centralOffset += 2;
    centralView.setUint16(centralOffset, time, true);
    centralOffset += 2;
    centralView.setUint16(centralOffset, date, true);
    centralOffset += 2;
    centralView.setUint32(centralOffset, crc, true);
    centralOffset += 4;
    centralView.setUint32(centralOffset, contentBytes.length, true);
    centralOffset += 4;
    centralView.setUint32(centralOffset, contentBytes.length, true);
    centralOffset += 4;
    centralView.setUint16(centralOffset, nameBytes.length, true);
    centralOffset += 2;
    centralView.setUint16(centralOffset, 0, true);
    centralOffset += 2;
    centralView.setUint16(centralOffset, 0, true);
    centralOffset += 2;
    centralView.setUint16(centralOffset, 0, true);
    centralOffset += 2;
    centralView.setUint16(centralOffset, 0, true);
    centralOffset += 2;
    centralView.setUint32(centralOffset, 0, true);
    centralOffset += 4;
    centralView.setUint32(centralOffset, offset, true);
    centralOffset += 4;
    centralHeader.set(nameBytes, centralOffset);
    centralParts.push(centralHeader);

    offset += localHeader.length;
  });

  const centralDirectoryOffset = offset;
  const centralDirectorySize = centralParts.reduce(
    (total, part) => total + part.length,
    0,
  );
  const endRecord = new Uint8Array(22);
  const endView = new DataView(endRecord.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(4, 0, true);
  endView.setUint16(6, 0, true);
  endView.setUint16(8, files.length, true);
  endView.setUint16(10, files.length, true);
  endView.setUint32(12, centralDirectorySize, true);
  endView.setUint32(16, centralDirectoryOffset, true);
  endView.setUint16(20, 0, true);

  return new Blob([...localParts, ...centralParts, endRecord], { type });
};

const createXlsxBlob = (rows) => {
  const sheetRows = rows
    .map(
      (row, rowIndex) =>
        `<row r="${rowIndex + 1}">${row
          .map((cell, columnIndex) => buildXlsxCell(cell, rowIndex, columnIndex))
          .join("")}</row>`,
    )
    .join("");
  const worksheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>${sheetRows}</sheetData>
</worksheet>`;
  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
 xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="Invoice" sheetId="1" r:id="rId1"/></sheets>
</workbook>`;
  const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`;
  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`;

  return createZipBlob(
    [
      { name: "[Content_Types].xml", content: contentTypes },
      { name: "_rels/.rels", content: rootRels },
      { name: "xl/workbook.xml", content: workbook },
      { name: "xl/_rels/workbook.xml.rels", content: workbookRels },
      { name: "xl/worksheets/sheet1.xml", content: worksheet },
    ],
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
};

const getInvoiceExportRows = (rows) =>
  rows.map((row) => [
    formatTimestamp(row.timestamp),
    row.sku || "",
    row.product_name || "",
    row.fba_id || "",
    row.shipment_id || "",
    row.service || "",
    Number(row.qty) || 0,
    Number(row.unit_price) || 0,
    Number(row.total_charge) || 0,
    row.invoice_pay_week ?? "",
    row.invoice_payment_status === "paid" ? "Paid" : "Unpaid",
  ]);

const InvoicePage = () => {
  const { user } = useAuth();
  const isAdmin = user?.role?.toLowerCase() === "admin";
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [lastSelectedIndex, setLastSelectedIndex] = useState(null);
  const [itemsPerPage, setItemsPerPage] = useState(25);
  const [currentPage, setCurrentPage] = useState(1);
  const [bulkPayWeek, setBulkPayWeek] = useState("");
  const [bulkPaymentStatus, setBulkPaymentStatus] = useState("");
  const [skuSearch, setSkuSearch] = useState("");
  const [selectedSkus, setSelectedSkus] = useState([]);
  const [draftPayWeeks, setDraftPayWeeks] = useState({});
  const [message, setMessage] = useState({ type: "", text: "" });

  useEffect(() => {
    if (!isAdmin) return;

    let isActive = true;
    const fetchInvoiceTransactions = async () => {
      setLoading(true);
      try {
        const res = await api.get("/invoice");
        if (isActive) {
          setTransactions(res.data);
          setSelectedIds(new Set());
        }
      } catch (err) {
        console.error("Error fetching invoice transactions", err);
        if (isActive) {
          setMessage({
            type: "error",
            text: err.response?.data?.message || "Failed to load invoices",
          });
        }
      } finally {
        if (isActive) setLoading(false);
      }
    };

    fetchInvoiceTransactions();
    return () => {
      isActive = false;
    };
  }, [isAdmin]);

  const skuOptions = useMemo(
    () =>
      [
        ...new Set(
          transactions
            .map((transaction) => String(transaction.sku || "").trim())
            .filter(Boolean),
        ),
      ].sort((a, b) => a.localeCompare(b)),
    [transactions],
  );

  const filteredTransactions = useMemo(() => {
    const selectedSkuSet = new Set(
      selectedSkus.map((sku) => String(sku).toUpperCase()),
    );

    return [...transactions]
      .sort((a, b) => getTimestampValue(a.timestamp) - getTimestampValue(b.timestamp))
      .filter((transaction) => {
        if (selectedSkuSet.size === 0) return true;
        return selectedSkuSet.has(String(transaction.sku || "").toUpperCase());
      });
  }, [transactions, selectedSkus]);

  const totalPages = Math.max(
    1,
    Math.ceil(filteredTransactions.length / itemsPerPage),
  );
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentRows = useMemo(
    () => filteredTransactions.slice(indexOfFirstItem, indexOfLastItem),
    [filteredTransactions, indexOfFirstItem, indexOfLastItem],
  );
  const currentPageIds = useMemo(
    () => currentRows.map((transaction) => transaction._id),
    [currentRows],
  );
  const isCurrentPageSelected =
    currentPageIds.length > 0 &&
    currentPageIds.every((id) => selectedIds.has(id));

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  useEffect(() => {
    setCurrentPage(1);
    setSelectedIds(new Set());
    setLastSelectedIndex(null);
  }, [selectedSkus]);

  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }

  const showMessage = (type, text) => {
    setMessage({ type, text });
    window.setTimeout(() => setMessage({ type: "", text: "" }), 3000);
  };

  const saveRows = async (ids, updates) => {
    if (ids.length === 0) return false;

    setSaving(true);
    try {
      await api.put("/invoice/bulk", { ids, ...updates });
      const idSet = new Set(ids);
      const hasPayWeek = Object.prototype.hasOwnProperty.call(
        updates,
        "pay_week",
      );
      const hasPaymentStatus = Object.prototype.hasOwnProperty.call(
        updates,
        "payment_status",
      );
      const nextPayWeek =
        updates.pay_week === "" || updates.pay_week === null
          ? ""
          : Number(updates.pay_week);

      setTransactions((prev) =>
        prev.map((transaction) => {
          if (!idSet.has(transaction._id)) return transaction;
          return {
            ...transaction,
            ...(hasPayWeek ? { invoice_pay_week: nextPayWeek } : {}),
            ...(hasPaymentStatus
              ? { invoice_payment_status: updates.payment_status }
              : {}),
          };
        }),
      );
      showMessage("success", "Invoice rows updated");
      return true;
    } catch (err) {
      console.error("Error updating invoice rows", err);
      showMessage(
        "error",
        err.response?.data?.message || "Failed to update invoice rows",
      );
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleRowSelect = (transactionId, absoluteIndex, checked, shiftKey) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (shiftKey && lastSelectedIndex !== null) {
        const start = Math.min(lastSelectedIndex, absoluteIndex);
        const end = Math.max(lastSelectedIndex, absoluteIndex);
        filteredTransactions.slice(start, end + 1).forEach((transaction) => {
          if (checked) {
            next.add(transaction._id);
          } else {
            next.delete(transaction._id);
          }
        });
      } else if (checked) {
        next.add(transactionId);
      } else {
        next.delete(transactionId);
      }
      return next;
    });
    setLastSelectedIndex(absoluteIndex);
  };

  const handleSelectCurrentPage = (checked) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      currentPageIds.forEach((id) => {
        if (checked) {
          next.add(id);
        } else {
          next.delete(id);
        }
      });
      return next;
    });
  };

  const handleToggleSku = (sku, checked) => {
    setSelectedSkus((prev) =>
      checked ? [...prev, sku] : prev.filter((selectedSku) => selectedSku !== sku),
    );
  };

  const handleApplyBulk = async () => {
    const ids = Array.from(selectedIds);
    const updates = {};

    if (bulkPayWeek !== "") {
      updates.pay_week = bulkPayWeek;
    }
    if (bulkPaymentStatus) {
      updates.payment_status = bulkPaymentStatus;
    }
    if (Object.keys(updates).length === 0) {
      showMessage("error", "Choose a pay week or payment status first");
      return;
    }

    const saved = await saveRows(ids, updates);
    if (saved) {
      setBulkPayWeek("");
      setBulkPaymentStatus("");
    }
  };

  const handlePayWeekChange = (transactionId, value) => {
    setDraftPayWeeks((prev) => ({ ...prev, [transactionId]: value }));
  };

  const handlePayWeekBlur = async (transaction) => {
    const transactionId = transaction._id;
    const draftValue =
      draftPayWeeks[transactionId] ??
      String(transaction.invoice_pay_week ?? "");
    const currentValue = String(transaction.invoice_pay_week ?? "");

    if (draftValue === currentValue) {
      setDraftPayWeeks((prev) => {
        const next = { ...prev };
        delete next[transactionId];
        return next;
      });
      return;
    }

    const targetIds = selectedIds.has(transactionId)
      ? Array.from(selectedIds)
      : [transactionId];
    const saved = await saveRows(targetIds, { pay_week: draftValue });
    if (saved) {
      setDraftPayWeeks((prev) => {
        const next = { ...prev };
        delete next[transactionId];
        return next;
      });
    }
  };

  const handlePaymentStatusChange = (transactionId, paymentStatus) => {
    const targetIds = selectedIds.has(transactionId)
      ? Array.from(selectedIds)
      : [transactionId];
    saveRows(targetIds, { payment_status: paymentStatus });
  };

  const handleDownloadExcel = () => {
    const headers = [
      "Timestamp",
      "SKU",
      "Product Name",
      "FBA ID",
      "Shipment ID (Tracking)",
      "Service",
      "Qty",
      "Unit Price",
      "Total Charge",
      "Pay Week",
      "Payment Status",
    ];
    const rows = [headers, ...getInvoiceExportRows(filteredTransactions)];
    const blob = createXlsxBlob(rows);
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `invoice_${new Date().toISOString().split("T")[0]}.xlsx`,
    );
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold">Invoice</h1>
          <p className="text-sm text-gray-500">
            {filteredTransactions.length.toLocaleString()} of{" "}
            {transactions.length.toLocaleString()} FBA/FBM charge rows
          </p>
        </div>

        <div className="flex flex-col sm:flex-row flex-wrap gap-3 bg-white border rounded p-3 shadow-sm">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Pay Week
            </label>
            <input
              type="number"
              min="1"
              step="1"
              value={bulkPayWeek}
              onChange={(e) => setBulkPayWeek(e.target.value)}
              className="w-28 border rounded px-2 py-1 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Payment Status
            </label>
            <select
              value={bulkPaymentStatus}
              onChange={(e) => setBulkPaymentStatus(e.target.value)}
              className="w-32 border rounded px-2 py-1 text-sm bg-white"
            >
              <option value="">No change</option>
              <option value="unpaid">Unpaid</option>
              <option value="paid">Paid</option>
            </select>
          </div>
          <div className="flex items-end gap-2">
            <button
              onClick={handleApplyBulk}
              disabled={saving || selectedIds.size === 0}
              className="bg-indigo-600 text-white border border-indigo-700 px-4 py-1.5 rounded text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? "Saving..." : "Apply"}
            </button>
            <button
              onClick={() => setSelectedIds(new Set())}
              disabled={selectedIds.size === 0}
              className="bg-white text-gray-700 border border-gray-300 px-4 py-1.5 rounded text-sm font-medium hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Clear
            </button>
            <button
              onClick={handleDownloadExcel}
              disabled={filteredTransactions.length === 0}
              className="bg-white text-gray-700 border border-gray-300 px-4 py-1.5 rounded text-sm font-medium hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Download Excel
            </button>
          </div>
          <div className="flex items-end text-sm text-gray-500">
            {selectedIds.size.toLocaleString()} selected
          </div>
        </div>
      </div>

      {message.text && (
        <div
          className={`mb-4 rounded border px-4 py-2 text-sm ${
            message.type === "success"
              ? "bg-green-50 border-green-200 text-green-700"
              : "bg-red-50 border-red-200 text-red-700"
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="bg-white p-4 rounded shadow border mb-4">
        <p className="text-xs font-semibold text-gray-500 uppercase mb-4">
          Filters
        </p>
        <div className="max-w-md">
          <label className="block text-xs font-medium text-gray-700 mb-1">
            SKU
          </label>
          <input
            type="text"
            placeholder="Search SKU..."
            value={skuSearch}
            onChange={(e) => setSkuSearch(e.target.value)}
            className="w-full border rounded px-2 py-1 text-sm mb-2"
          />
          <div className="max-h-40 overflow-y-auto border rounded p-2 text-xs">
            {skuOptions
              .filter((sku) =>
                String(sku).toUpperCase().includes(skuSearch.toUpperCase()),
              )
              .map((sku) => (
                <label key={sku} className="flex items-center space-x-2 mb-1">
                  <input
                    type="checkbox"
                    checked={selectedSkus.includes(sku)}
                    onChange={(e) => handleToggleSku(sku, e.target.checked)}
                    className="rounded text-indigo-600 h-3 w-3"
                  />
                  <span>{sku}</span>
                </label>
              ))}
          </div>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row justify-between items-center bg-white p-4 border rounded shadow gap-4 mb-4">
        <div className="flex items-center space-x-2 text-sm text-gray-700">
          <span>Show</span>
          <select
            value={itemsPerPage}
            onChange={(e) => {
              setItemsPerPage(Number(e.target.value));
              setCurrentPage(1);
            }}
            className="border rounded px-2 py-1 focus:ring-indigo-500 focus:border-indigo-500"
          >
            {[25, 50, 100, 250, 500].map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
          <span>rows</span>
          <span className="ml-4 text-gray-500">
            Showing {filteredTransactions.length > 0 ? indexOfFirstItem + 1 : 0}{" "}
            to {Math.min(indexOfLastItem, filteredTransactions.length)} of{" "}
            {filteredTransactions.length.toLocaleString()}
          </span>
        </div>

        <div className="flex items-center space-x-1">
          <button
            onClick={() => setCurrentPage(1)}
            disabled={currentPage === 1}
            className="px-3 py-1 border rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
          >
            First
          </button>
          <button
            onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
            disabled={currentPage === 1}
            className="px-3 py-1 border rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
          >
            Previous
          </button>
          <div className="px-4 py-1 text-sm font-medium">
            Page {currentPage} of {totalPages}
          </div>
          <button
            onClick={() =>
              setCurrentPage((prev) => Math.min(prev + 1, totalPages))
            }
            disabled={currentPage === totalPages}
            className="px-3 py-1 border rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
          >
            Next
          </button>
          <button
            onClick={() => setCurrentPage(totalPages)}
            disabled={currentPage === totalPages}
            className="px-3 py-1 border rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
          >
            Last
          </button>
        </div>
      </div>

      <div className="bg-white shadow border rounded overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50 text-[10px]">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase w-10">
                <input
                  type="checkbox"
                  checked={isCurrentPageSelected}
                  onChange={(e) => handleSelectCurrentPage(e.target.checked)}
                  className="rounded text-indigo-600 h-4 w-4"
                />
              </th>
              <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase">
                Timestamp
              </th>
              <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase">
                SKU
              </th>
              <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase">
                Product Name
              </th>
              <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase">
                FBA ID
              </th>
              <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase">
                Shipment ID (Tracking)
              </th>
              <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase">
                Service
              </th>
              <th className="px-3 py-2 text-right font-medium text-gray-500 uppercase">
                Qty
              </th>
              <th className="px-3 py-2 text-right font-medium text-gray-500 uppercase">
                Unit Price
              </th>
              <th className="px-3 py-2 text-right font-medium text-gray-500 uppercase">
                Total Charge
              </th>
              <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase">
                Pay Week
              </th>
              <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase">
                Payment Status
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200 text-xs text-gray-600">
            {currentRows.map((row, index) => {
              const absoluteIndex = indexOfFirstItem + index;
              const isSelected = selectedIds.has(row._id);
              const status =
                row.invoice_payment_status === "paid" ? "paid" : "unpaid";

              return (
                <tr
                  key={row.row_id || row._id}
                  className={isSelected ? "bg-indigo-50" : "hover:bg-gray-50"}
                >
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={(e) =>
                        handleRowSelect(
                          row._id,
                          absoluteIndex,
                          e.target.checked,
                          e.nativeEvent.shiftKey,
                        )
                      }
                      className="rounded text-indigo-600 h-4 w-4"
                    />
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {formatTimestamp(row.timestamp)}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap font-medium text-gray-900">
                    {row.sku}
                  </td>
                  <td className="px-3 py-2 min-w-[220px] max-w-[280px] truncate">
                    {row.product_name}
                  </td>
                  <td className="px-3 py-2 max-w-[180px] truncate">
                    {row.fba_id}
                  </td>
                  <td className="px-3 py-2 min-w-[180px] max-w-[260px] truncate">
                    {row.shipment_id}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap capitalize">
                    {row.service}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    {Number(row.qty || 0).toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    {Number(row.unit_price || 0).toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 4,
                    })}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap font-medium text-gray-900">
                    {Number(row.total_charge || 0).toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={
                        draftPayWeeks[row._id] ??
                        row.invoice_pay_week ??
                        ""
                      }
                      onChange={(e) =>
                        handlePayWeekChange(row._id, e.target.value)
                      }
                      onBlur={() => handlePayWeekBlur(row)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") e.currentTarget.blur();
                      }}
                      disabled={saving}
                      className="w-20 border rounded px-2 py-1 text-xs disabled:bg-gray-100"
                    />
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <select
                      value={status}
                      onChange={(e) =>
                        handlePaymentStatusChange(
                          row._id,
                          e.target.value,
                        )
                      }
                      disabled={saving}
                      className={`w-24 border rounded px-2 py-1 text-xs capitalize disabled:bg-gray-100 ${
                        status === "paid"
                          ? "border-green-200 bg-green-50 text-green-700"
                          : "border-amber-200 bg-amber-50 text-amber-700"
                      }`}
                    >
                      <option value="unpaid">Unpaid</option>
                      <option value="paid">Paid</option>
                    </select>
                  </td>
                </tr>
              );
            })}
            {currentRows.length === 0 && (
              <tr>
                <td colSpan="12" className="px-3 py-10 text-center text-gray-500">
                  No FBA or FBM charges found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default InvoicePage;
