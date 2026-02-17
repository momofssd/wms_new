import { useState } from "react";
import api from "../api";

const ShipmentTrackingPage = () => {
  const [extractedNumbers, setExtractedNumbers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const [message, setMessage] = useState({ type: "", text: "" });
  const [isDragging, setIsDragging] = useState(false);

  const itemsPerPage = 25;

  const handleProcessFiles = async (files) => {
    if (!files || files.length === 0) return;

    setLoading(true);
    setMessage({ type: "", text: "" });

    let allExtracted = [];

    try {
      for (const file of files) {
        if (file.type === "application/pdf") {
          const formData = new FormData();
          formData.append("pdf", file);
          const res = await api.post("/outbound/process-pdf", formData);
          allExtracted = [...allExtracted, ...res.data.trackingNumbers];
        }
      }

      // Remove duplicates
      const unique = [...new Set(allExtracted)];
      setExtractedNumbers(unique);
      setCurrentPage(0);
      if (unique.length > 0) {
        setMessage({
          type: "success",
          text: `Extracted ${unique.length} unique tracking numbers.`,
        });
      } else {
        setMessage({
          type: "error",
          text: "No tracking numbers found in files.",
        });
      }
    } catch (err) {
      setMessage({
        type: "error",
        text:
          "Error processing files: " +
          (err.response?.data?.message || err.message),
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    handleProcessFiles(e.dataTransfer.files);
  };

  const totalPages = Math.ceil(extractedNumbers.length / itemsPerPage);
  const currentBatch = extractedNumbers.slice(
    currentPage * itemsPerPage,
    (currentPage + 1) * itemsPerPage,
  );

  // Formatting for display
  const wrapText = (items) => {
    let result = "";
    let line = "";
    items.forEach((item, i) => {
      if ((line + item).length > 80) {
        result += line.trim() + ",\n";
        line = item + ", ";
      } else {
        line += item + ", ";
      }
    });
    result += line.replace(/, $/, "");
    return result;
  };

  const openUSPSTracking = () => {
    const encoded = currentBatch.join("%2C");
    const url = `https://tools.usps.com/go/TrackConfirmAction?tRef=fullpage&tLc=19&text28777=&tLabels=${encoded}&tABt=false`;
    window.open(url, "_blank");
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">Shipment Tracking</h1>
      <p className="text-sm text-gray-500 mb-8">
        Extract tracking numbers from labels using text extraction and barcode
        scanning.
      </p>

      <div className="grid grid-cols-2 gap-8">
        <div className="space-y-6">
          <div className="bg-white p-6 rounded shadow border">
            <h2 className="text-xl font-semibold mb-4">Track by Label (PDF)</h2>
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-lg p-12 text-center transition-colors cursor-pointer ${
                isDragging
                  ? "border-indigo-500 bg-indigo-50"
                  : "border-gray-300 hover:border-gray-400"
              }`}
            >
              <div className="space-y-2">
                <svg
                  className="mx-auto h-12 w-12 text-gray-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="G9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
                <div className="text-sm text-gray-600">
                  <label className="text-indigo-600 font-medium hover:underline">
                    <span>Upload labels</span>
                    <input
                      type="file"
                      multiple
                      accept=".pdf"
                      className="sr-only"
                      onChange={(e) => handleProcessFiles(e.target.files)}
                    />
                  </label>
                  <p>or drag and drop</p>
                </div>
                <p className="text-xs text-gray-500">PDF label files only</p>
              </div>
            </div>

            {loading && (
              <div className="mt-4 text-center">
                <div className="inline-block animate-spin rounded-full h-4 w-4 border-b-2 border-indigo-600 mr-2"></div>
                <span className="text-sm text-gray-600">
                  Processing labels...
                </span>
              </div>
            )}

            {message.text && (
              <div
                className={`mt-4 p-3 rounded text-sm ${message.type === "success" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}
              >
                {message.text}
              </div>
            )}
          </div>
        </div>

        <div className="bg-white p-6 rounded shadow border">
          <h2 className="text-xl font-semibold mb-4">Output</h2>
          {extractedNumbers.length > 0 ? (
            <div className="space-y-6">
              <div className="flex justify-between items-center text-sm">
                <span className="font-medium text-gray-700">
                  Batch {currentPage + 1} of {totalPages}
                </span>
                <span className="text-gray-500">
                  {extractedNumbers.length} total numbers
                </span>
              </div>

              <div className="bg-gray-50 p-4 rounded border font-mono text-xs whitespace-pre-wrap break-all h-64 overflow-y-auto">
                {wrapText(currentBatch)}
              </div>

              <button
                onClick={openUSPSTracking}
                className="w-full flex items-center justify-center bg-indigo-600 text-white py-3 rounded-md font-bold hover:bg-indigo-700 shadow-sm"
              >
                🚚 USPS Web Tracking (Batch {currentPage + 1})
              </button>

              {totalPages > 1 && (
                <div className="flex justify-between items-center pt-4 border-t">
                  <button
                    disabled={currentPage === 0}
                    onClick={() => setCurrentPage(currentPage - 1)}
                    className="px-4 py-2 border rounded text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
                  >
                    ⬅️ Previous
                  </button>
                  <span className="text-sm text-gray-600">
                    Page {currentPage + 1} / {totalPages}
                  </span>
                  <button
                    disabled={currentPage === totalPages - 1}
                    onClick={() => setCurrentPage(currentPage + 1)}
                    className="px-4 py-2 border rounded text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
                  >
                    Next ➡️
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-64 text-gray-400">
              <p>No tracking numbers extracted yet.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ShipmentTrackingPage;
