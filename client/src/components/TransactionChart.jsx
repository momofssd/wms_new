import { useEffect, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import api from "../api";

const TransactionChart = () => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await api.get("/transactions/stats");
        setData(res.data);
      } catch (err) {
        console.error("Error fetching transaction stats:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, []);

  if (loading)
    return <div className="text-center py-10">Loading chart data...</div>;
  if (data.length === 0)
    return (
      <div className="text-center py-10">No data available for chart.</div>
    );

  return (
    <div className="h-96 w-full bg-white p-4 rounded-lg shadow-inner overflow-x-auto">
      <div style={{ width: "100%", minWidth: "800px", height: "100%" }}>
        <LineChart
          width={800}
          height={340}
          data={data}
          margin={{
            top: 5,
            right: 30,
            left: 20,
            bottom: 5,
          }}
        >
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            dataKey="week"
            tick={{ fontSize: 10 }}
            label={{
              value: "Week Start",
              position: "insideBottomRight",
              offset: -5,
              fontSize: 12,
            }}
          />
          <YAxis
            yAxisId="left"
            label={{
              value: "Quantity",
              angle: -90,
              position: "insideLeft",
              fontSize: 12,
            }}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            label={{
              value: "Total Charge ($)",
              angle: 90,
              position: "insideRight",
              fontSize: 12,
            }}
          />
          <Tooltip
            formatter={(value, name) => {
              if (name === "Total Charge ($)")
                return [`$${Number(value).toFixed(2)}`, name];
              return [value, name];
            }}
          />
          <Legend verticalAlign="top" height={36} />
          <Line
            yAxisId="left"
            type="monotone"
            dataKey="fba"
            stroke="#4f46e5"
            name="FBA"
            strokeWidth={3}
            activeDot={{ r: 8 }}
          />
          <Line
            yAxisId="left"
            type="monotone"
            dataKey="fulfillment"
            stroke="#10b981"
            name="Fullfilment"
            strokeWidth={3}
          />
          <Line
            yAxisId="left"
            type="monotone"
            dataKey="inbound"
            stroke="#f59e0b"
            name="Total Inbound (by week)"
            strokeWidth={3}
          />
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="charge"
            stroke="#ef4444"
            name="Total Charge ($)"
            strokeWidth={3}
            strokeDasharray="5 5"
          />
        </LineChart>
      </div>
    </div>
  );
};

export default TransactionChart;
