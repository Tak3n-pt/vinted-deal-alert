import React from "react";
import Chart from "react-apexcharts";

/** Tiny breadcrumb stat bar — 70×40, matches MaterialPro's .breadbar. */
export default function Breadbar({ color = "primary", data = [5, 8, 7, 12, 6, 7, 15, 20] }) {
  const stroke =
    color === "secondary" ? "var(--bs-secondary)" :
    color === "danger" ? "var(--bs-danger)" :
    color === "success" ? "var(--bs-success)" : "var(--bs-primary)";
  const options = {
    chart: { type: "bar", width: 70, height: 40, toolbar: { show: false }, sparkline: { enabled: true } },
    colors: [stroke],
    plotOptions: { bar: { horizontal: false, borderRadius: 2, columnWidth: "50%", barHeight: "100%" } },
    dataLabels: { enabled: false },
    stroke: { show: true, width: 0, colors: ["transparent"] },
    xaxis: { axisBorder: { show: false }, axisTicks: { show: false }, labels: { show: false } },
    yaxis: { labels: { show: false } },
    fill: { opacity: 1 },
    tooltip: { theme: "dark", x: { show: false }, y: { formatter: undefined } }
  };
  const series = [{ name: "", data }];
  return <Chart options={options} series={series} type="bar" width={70} height={40} />;
}
