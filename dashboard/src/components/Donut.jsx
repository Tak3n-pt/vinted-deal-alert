import React from "react";
import Chart from "react-apexcharts";

/**
 * Doughnut chart for the score distribution panel.
 */
export default function Donut({ labels, series, colors, height = 250, totalLabel = "Total" }) {
  const total = series.reduce((sum, value) => sum + value, 0);
  const options = {
    chart: { type: "donut", fontFamily: "inherit", foreColor: "#adb0bb" },
    labels,
    colors,
    legend: { show: false },
    stroke: { show: false },
    dataLabels: { enabled: false },
    plotOptions: {
      pie: {
        donut: {
          size: "75%",
          labels: {
            show: true,
            name: { offsetY: 7 },
            value: { show: false },
            total: {
              show: true,
              label: totalLabel,
              fontSize: "20px",
              fontWeight: 600,
              color: "var(--bs-body-color)",
              formatter: () => total
            }
          }
        }
      }
    },
    tooltip: { theme: "dark", fillSeriesColor: false }
  };
  return <Chart options={options} series={series} type="donut" height={height} />;
}
