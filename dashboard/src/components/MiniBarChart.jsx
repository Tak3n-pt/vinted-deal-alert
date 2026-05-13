import React from "react";
import Chart from "react-apexcharts";

/** Compact white-on-color bar chart — clones MaterialPro's Download_count chart. */
export default function MiniBarChart({ data = [4, 5, 2, 10, 9, 12, 4, 9, 4, 5, 3, 10] }) {
  const options = {
    chart: { type: "bar", fontFamily: "inherit", height: 50, foreColor: "#adb0bb", toolbar: { show: false }, sparkline: { enabled: true } },
    colors: ["rgba(255, 255, 255, 0.7)"],
    grid: { show: false },
    plotOptions: { bar: { horizontal: false, columnWidth: "60%", barHeight: "100%", borderRadius: 2 } },
    dataLabels: { enabled: false },
    stroke: { show: true, width: 4, colors: ["transparent"] },
    xaxis: { axisBorder: { show: false }, axisTicks: { show: false }, labels: { show: false } },
    yaxis: { labels: { show: false } },
    fill: { opacity: 1 },
    tooltip: { theme: "dark", x: { show: false } }
  };
  const series = [{ name: "", data }];
  return <Chart options={options} series={series} type="bar" height={50} />;
}
