import React from "react";
import Chart from "react-apexcharts";

/**
 * Horizontal or vertical bar chart — used for score distribution, top rejection
 * reasons, listing age buckets. Single-series. Lightly themed to match MP.
 */
export default function BarChart({
  categories,
  data,
  horizontal = false,
  height = 300,
  color = "#1e88e5",
  showValues = true
}) {
  const options = {
    chart: { type: "bar", height, fontFamily: "inherit", toolbar: { show: false }, foreColor: "#adb0bb" },
    plotOptions: {
      bar: {
        horizontal,
        borderRadius: 4,
        columnWidth: "55%",
        dataLabels: { position: horizontal ? "top" : "top" }
      }
    },
    dataLabels: {
      enabled: showValues,
      offsetY: horizontal ? 0 : -18,
      offsetX: horizontal ? 24 : 0,
      style: { fontSize: "11px", colors: ["#67757c"], fontWeight: 600 }
    },
    colors: [color],
    grid: { borderColor: "var(--bs-border-color)", strokeDashArray: 4, padding: { left: 8, right: 8 } },
    xaxis: {
      categories,
      axisBorder: { show: false },
      axisTicks: { show: false },
      labels: { style: { fontSize: "11px", colors: "#a1aab2" } }
    },
    yaxis: { labels: { style: { fontSize: "11px", colors: "#a1aab2" } } },
    tooltip: { theme: "dark" }
  };
  const series = [{ name: "Total", data }];
  return <Chart options={options} series={series} type="bar" height={height} />;
}
