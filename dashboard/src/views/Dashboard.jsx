// 1:1 visual clone of MaterialPro horizontal/index3 dashboard body.
// All values are mock data taken verbatim from the demo so the layout
// renders identically. Real bot data lives in /Statistiques and other views.

import React from "react";
import Sparkline from "../components/Sparkline.jsx";
import Breadbar from "../components/Breadbar.jsx";
import AreaChart from "../components/AreaChart.jsx";
import OurVisitorsDonut from "../components/OurVisitorsDonut.jsx";
import MiniLineChart from "../components/MiniLineChart.jsx";
import MiniBarChart from "../components/MiniBarChart.jsx";

// Mock data exactly matches the MaterialPro demo's dashboard3.js / breadcrumbChart.js.
const NEWSLETTER_CATEGORIES = ["", "8 AM", "81 AM", "9 AM", "10 AM", "11 AM", "12 PM", "13 PM", "14 PM", "15 PM", "16 PM", "17 PM", "18 PM", "18:20 PM", "18:20 PM", "19 PM", "20 PM", "21 PM", ""];
const NEWSLETTER_SERIES = [
  { name: "Inbound Calls", data: [65, 80, 80, 60, 60, 45, 45, 80, 80, 70, 70, 90, 90, 80, 80, 80, 60, 60, 50] },
  { name: "Outbound Calls", data: [90, 110, 110, 95, 95, 85, 85, 95, 95, 115, 115, 100, 100, 115, 115, 95, 95, 85, 85] }
];

export default function Dashboard() {
  return (
    <>
      {/* Breadcrumb */}
      <div className="font-weight-medium shadow-none position-relative overflow-hidden mb-7">
        <div className="card-body px-0">
          <div className="d-flex justify-content-between align-items-center">
            <div>
              <h4 className="font-weight-medium mb-0">Dashboard</h4>
              <nav aria-label="breadcrumb">
                <ol className="breadcrumb">
                  <li className="breadcrumb-item"><a className="text-muted text-decoration-none" href="#" onClick={(e) => e.preventDefault()}>Home</a></li>
                  <li className="breadcrumb-item text-muted" aria-current="page">Dashboard</li>
                </ol>
              </nav>
            </div>
            <div>
              <div className="d-sm-flex d-none gap-3 no-block justify-content-end align-items-center">
                <div className="d-flex gap-2 align-items-center">
                  <div>
                    <small>This Month</small>
                    <h4 className="text-primary mb-0">$58,256</h4>
                  </div>
                  <div className="breadbar"><Breadbar color="primary" /></div>
                </div>
                <div className="d-flex gap-2 align-items-center">
                  <div>
                    <small>Last Month</small>
                    <h4 className="text-secondary mb-0">$58,256</h4>
                  </div>
                  <div className="breadbar2"><Breadbar color="secondary" /></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="row">
        {/* First column — Online Revenue + Ad. Expense + Upgrade Plan */}
        <div className="col-lg-5">
          <div className="row">
            <div className="col-md-6">
              <div className="card">
                <div className="card-body p-9">
                  <p className="card-subtitle">Online Revenue</p>
                  <h4 className="card-title mb-1">$2376</h4>
                  <div id="online-revenue">
                    <Sparkline data={[0, 150, 110, 240, 200, 200, 300, 200]} color="secondary" height={64} />
                  </div>
                </div>
              </div>
            </div>
            <div className="col-md-6">
              <div className="card overflow-hidden">
                <div className="card-body bg-secondary text-center">
                  <div className="my-2">
                    <h6 className="text-white">Ad. Expense</h6>
                    <h2 className="mb-0 text-white" style={{ fontSize: "2.2rem" }}>12.5m</h2>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="card bonoitec-upgrade-plan">
            <div className="card-body position-relative z-1 p-7">
              <p className="text-white mb-1 opacity-75">Grab the top deal.</p>
              <h3 className="text-white fw-semibold mb-0">Upgrade Plan</h3>
              <div className="d-flex gap-9 my-4 pb-2">
                <div className="d-flex align-items-center gap-2">
                  <div className="round-36 bg-white bg-opacity-25 rounded-circle d-flex align-items-center justify-content-center">
                    <iconify-icon icon="solar:user-line-duotone" class="fs-5 text-white"></iconify-icon>
                  </div>
                  <div>
                    <p className="mb-0 fs-2 text-white text-opacity-75">Team</p>
                    <h6 className="mb-0 fs-2 text-white fw-semibold">Up to 240</h6>
                  </div>
                </div>
                <div className="d-flex align-items-center gap-2">
                  <div className="round-36 bg-white bg-opacity-25 rounded-circle d-flex align-items-center justify-content-center">
                    <iconify-icon icon="solar:graph-up-line-duotone" class="fs-5 text-white"></iconify-icon>
                  </div>
                  <div>
                    <p className="mb-0 fs-2 text-white text-opacity-75">Progress</p>
                    <h6 className="mb-0 fs-2 text-white fw-semibold">Almost 85%</h6>
                  </div>
                </div>
              </div>
              <a href="#" onClick={(e) => e.preventDefault()} className="btn btn-primary bg-white bg-opacity-25 border-0 text-white">Upgrade Plan</a>
            </div>
          </div>
        </div>

        {/* Second column — Material Pro video card */}
        <div className="col-lg-4">
          <div className="card bonoitec-materialpro-bg shadow-none h-100">
            <div className="card-body p-4 d-flex align-items-center justify-content-center h-100">
              <div className="d-flex align-items-center gap-3">
                <button type="button" className="btn p-0 round-60 bg-white rounded-circle d-flex align-items-center justify-content-center" style={{ width: 60, height: 60 }}>
                  <iconify-icon icon="solar:play-bold" class="fs-6 text-dark"></iconify-icon>
                </button>
                <div>
                  <h4 className="mb-2 card-title text-dark">Material Pro</h4>
                  <p className="card-subtitle">The real story</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Third column — Highlights + Design Meetings */}
        <div className="col-lg-3">
          <div className="card">
            <div className="card-body p-7">
              <h3 className="card-title mb-3">Highlights</h3>
              <div className="d-flex justify-content-between align-items-center gap-6 py-3 border-bottom">
                <h6 className="mb-0">Daily Sales</h6>
                <div className="d-flex align-items-center gap-2">
                  <iconify-icon icon="solar:arrow-right-up-linear" class="fs-6 text-secondary"></iconify-icon>
                  <h6 className="mb-0">488</h6>
                </div>
              </div>
              <div className="d-flex justify-content-between align-items-center gap-6 py-3 border-bottom">
                <h6 className="mb-0">Avg. Clients</h6>
                <div className="d-flex align-items-center gap-2">
                  <iconify-icon icon="solar:arrow-right-up-linear" class="fs-6 text-danger"></iconify-icon>
                  <h6 className="mb-0">400</h6>
                </div>
              </div>
              <div className="d-flex justify-content-between align-items-center gap-6 py-3">
                <h6 className="mb-0">Pending Tasks</h6>
                <div className="d-flex align-items-center gap-2">
                  <iconify-icon icon="solar:arrow-left-down-linear" class="fs-6 text-secondary"></iconify-icon>
                  <h6 className="mb-0">4.3 <span className="text-muted">/37</span></h6>
                </div>
              </div>
            </div>
          </div>
          <div className="card overflow-hidden">
            <div className="card-body bonoitec-bg-purple p-7">
              <h3 className="card-title mb-2 text-white">Design Meetings</h3>
              <p className="card-subtitle text-white opacity-75 pb-2">2 Hours Left</p>
              <div className="d-flex justify-content-between align-items-center mt-3">
                <ul className="d-flex list-unstyled mb-0">
                  <li>
                    <img src="/assets/images/profile/user-2.jpg" className="rounded-circle border border-2" width="40" height="40" alt="" style={{ borderColor: "#5e35b1" }} />
                  </li>
                  <li style={{ marginLeft: -8 }}>
                    <img src="/assets/images/profile/user-9.jpg" className="rounded-circle border border-2" width="40" height="40" alt="" style={{ borderColor: "#5e35b1" }} />
                  </li>
                  <li style={{ marginLeft: -8 }}>
                    <span className="bg-dark text-white fs-2 rounded-circle border border-2 d-flex align-items-center justify-content-center" style={{ width: 40, height: 40, borderColor: "#5e35b1" }}>
                      +54
                    </span>
                  </li>
                </ul>
                <div className="d-flex align-items-center justify-content-center rounded-circle bg-warning" style={{ width: 40, height: 40 }}>
                  <iconify-icon icon="solar:arrow-right-up-linear" class="fs-6 text-white"></iconify-icon>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Newsletter Campaign */}
        <div className="col-lg-8">
          <div className="card">
            <div className="card-body">
              <div className="d-flex align-items-center flex-wrap mb-4">
                <div>
                  <h4 className="card-title">Newsletter Campaign</h4>
                  <p className="card-subtitle mb-0">Overview of Newsletter Campaign</p>
                </div>
                <div className="ms-auto align-self-center">
                  <ul className="d-flex align-items-center gap-3 mb-0 list-unstyled">
                    <li className="d-flex">
                      <div className="text-primary d-flex align-items-center gap-2 fs-3">
                        <iconify-icon icon="ri:circle-fill" class="fs-2"></iconify-icon>Open Rate
                      </div>
                    </li>
                    <li className="d-flex">
                      <div className="text-secondary d-flex align-items-center gap-2 fs-3">
                        <iconify-icon icon="ri:circle-fill" class="fs-2"></iconify-icon>Recurring Payments
                      </div>
                    </li>
                  </ul>
                </div>
              </div>
              <div id="newsletter-campaign">
                <AreaChart categories={NEWSLETTER_CATEGORIES} series={NEWSLETTER_SERIES} height={267} />
              </div>
              <div className="row text-center">
                <div className="col-lg-4 col-md-4 mt-4">
                  <h2 className="mb-0">5098</h2>
                  <small className="fs-3 text-muted">Total Sent</small>
                </div>
                <div className="col-lg-4 col-md-4 mt-4">
                  <h2 className="mb-0">4156</h2>
                  <small className="fs-3 text-muted">Mail Open Rate</small>
                </div>
                <div className="col-lg-4 col-md-4 mt-4">
                  <h2 className="mb-0">1369</h2>
                  <small className="fs-3 text-muted">Click Rate</small>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* My Contacts */}
        <div className="col-lg-4">
          <div className="card">
            <div className="card-body pb-0">
              <h4 className="card-title">My Contacts</h4>
              <p className="card-subtitle mb-0">Checkout my contacts here</p>
            </div>
            <div className="mt-3">
              {CONTACTS.map((c, i) => (
                <a href="#" onClick={(e) => e.preventDefault()} className="py-3 d-flex px-7 gap-3 text-decoration-none align-items-center" key={i}>
                  <div className="position-relative flex-shrink-0">
                    <img src={c.img} alt="user" className="rounded-circle" width="50" height="50" />
                    <span
                      className="d-inline-block position-absolute rounded-circle"
                      style={{ background: c.status === "online" ? "#26c6da" : "#5e35b1", width: 12, height: 12, bottom: 0, right: 0, border: "2px solid #fff" }}
                    ></span>
                  </div>
                  <div className="d-flex align-items-center w-100">
                    <div className="text-truncate flex-grow-1">
                      <h5 className="mb-1 text-dark fw-medium">{c.name}</h5>
                      <span className="text-muted fs-3">{c.msg}</span>
                    </div>
                    <div className="d-flex gap-1 ms-auto">
                      <button type="button" className="btn btn-sm bg-danger-subtle text-danger rounded-pill d-inline-flex align-items-center justify-content-center" style={{ width: 32, height: 32 }}>
                        <iconify-icon icon="solar:videocamera-line-duotone"></iconify-icon>
                      </button>
                      <button type="button" className="btn btn-sm bg-primary-subtle text-primary rounded-pill d-inline-flex align-items-center justify-content-center" style={{ width: 32, height: 32 }}>
                        <iconify-icon icon="solar:phone-calling-line-duotone"></iconify-icon>
                      </button>
                    </div>
                  </div>
                </a>
              ))}
            </div>
          </div>
        </div>

        {/* Current Visitors */}
        <div className="col-lg-4">
          <div className="card">
            <div className="card-body">
              <h4 className="card-title">Current Visitors</h4>
              <p className="card-subtitle">Different Devices Used to Visit</p>
              <div className="d-flex align-items-center justify-content-center my-3" style={{ height: 240 }}>
                <UsRegionsViz />
              </div>
              <div className="text-center">
                <ul className="list-inline mb-0 d-inline-flex justify-content-center">
                  <li className="list-inline-item px-2 me-0">
                    <div className="text-secondary d-flex align-items-center gap-2 fs-3">
                      <iconify-icon icon="ri:circle-fill" class="fs-2"></iconify-icon>Valley
                    </div>
                  </li>
                  <li className="list-inline-item px-2 me-0">
                    <div className="text-primary d-flex align-items-center gap-2 fs-3">
                      <iconify-icon icon="ri:circle-fill" class="fs-2"></iconify-icon>New York
                    </div>
                  </li>
                  <li className="list-inline-item px-2 me-0">
                    <div className="text-danger d-flex align-items-center gap-2 fs-3">
                      <iconify-icon icon="ri:circle-fill" class="fs-2"></iconify-icon>Kansas
                    </div>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        {/* Projects of the Month */}
        <div className="col-lg-8">
          <div className="card">
            <div className="card-body pb-3">
              <div className="d-md-flex">
                <h4 className="card-title">Projects of the Month</h4>
                <div className="ms-auto">
                  <select className="form-select rounded-pill fw-medium" defaultValue="January">
                    <option>January</option>
                    <option value="1">February</option>
                    <option value="2">March</option>
                    <option value="3">April</option>
                  </select>
                </div>
              </div>
              <div className="table-responsive mt-3">
                <table className="table align-middle mb-0">
                  <thead>
                    <tr>
                      <th className="border-0 ps-0">Client</th>
                      <th className="border-0">Name</th>
                      <th className="border-0">Priority</th>
                      <th className="border-0 text-end">Budget</th>
                    </tr>
                  </thead>
                  <tbody>
                    {PROJECTS.map((p, i) => (
                      <tr key={i} className={i === PROJECTS.length - 1 ? "" : ""}>
                        <td className="ps-0">
                          <div className="d-flex align-items-center gap-3">
                            <span className="rounded-circle overflow-hidden flex-shrink-0 d-inline-flex" style={{ width: 48, height: 48 }}>
                              <img src={p.img} alt="" className="img-fluid" />
                            </span>
                            <div>
                              <h5 className="mb-1">{p.client}</h5>
                              <p className="mb-0 fs-3 text-muted">{p.role}</p>
                            </div>
                          </div>
                        </td>
                        <td><p className="mb-0">{p.name}</p></td>
                        <td><span className={`badge bg-${p.priorityTone}-subtle text-${p.priorityTone}`}>{p.priorityLabel}</span></td>
                        <td className="text-end"><p className="mb-0 fs-3">{p.budget}</p></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        {/* Our Visitors */}
        <div className="col-lg-4">
          <div className="card h-100">
            <div className="card-body">
              <h4 className="card-title">Our Visitors</h4>
              <p className="card-subtitle">Different Devices Used to Visit</p>
              <div id="our-visitors" className="mt-3">
                <OurVisitorsDonut />
              </div>
            </div>
            <div className="card-body d-flex align-items-center justify-content-center border-top mt-3">
              <ul className="list-inline mb-0 d-inline-flex justify-content-center">
                <li className="list-inline-item px-2 me-0">
                  <div className="text-primary d-flex align-items-center gap-2 fs-3">
                    <iconify-icon icon="ri:circle-fill" class="fs-2"></iconify-icon>Mobile
                  </div>
                </li>
                <li className="list-inline-item px-2 me-0">
                  <div className="text-purple d-flex align-items-center gap-2 fs-3" style={{ color: "#5e35b1" }}>
                    <iconify-icon icon="ri:circle-fill" class="fs-2"></iconify-icon>Desktop
                  </div>
                </li>
                <li className="list-inline-item px-2 me-0">
                  <div className="text-secondary d-flex align-items-center gap-2 fs-3">
                    <iconify-icon icon="ri:circle-fill" class="fs-2"></iconify-icon>Tablet
                  </div>
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Bandwidth + Download */}
        <div className="col-lg-4">
          <div className="card w-100 overflow-hidden">
            <div className="card-body bonoitec-bg-purple">
              <div className="d-flex align-items-center gap-3 mb-4">
                <div className="bg-black bg-opacity-10 rounded-circle d-flex align-items-center justify-content-center" style={{ width: 48, height: 48 }}>
                  <iconify-icon icon="solar:server-square-linear" class="fs-7 text-white"></iconify-icon>
                </div>
                <div>
                  <h4 className="card-title text-white">Bandwidth usage</h4>
                  <p className="card-subtitle text-white opacity-70 mb-0">March 2024</p>
                </div>
              </div>
              <div className="row align-items-center">
                <div className="col-6"><h2 className="mb-0 text-white text-nowrap">50 GB</h2></div>
                <div className="col-6"><MiniLineChart /></div>
              </div>
            </div>
          </div>
          <div className="card w-100 overflow-hidden">
            <div className="card-body bg-secondary">
              <div className="d-flex align-items-center gap-3 mb-4">
                <div className="bg-white bg-opacity-25 rounded-circle d-flex align-items-center justify-content-center" style={{ width: 48, height: 48 }}>
                  <iconify-icon icon="solar:chart-2-linear" class="fs-7 text-white"></iconify-icon>
                </div>
                <div>
                  <h3 className="card-title text-white">Download count</h3>
                  <h6 className="card-subtitle text-white opacity-70 mb-0">March 2024</h6>
                </div>
              </div>
              <div className="row align-items-center">
                <div className="col-5"><h2 className="mb-0 text-white text-nowrap">35487</h2></div>
                <div className="col-7"><MiniBarChart /></div>
              </div>
            </div>
          </div>
        </div>

        {/* Profile card */}
        <div className="col-lg-4">
          <div className="card">
            <div className="card-body p-2">
              <img className="card-img-top w-100 rounded overflow-hidden" src="/assets/images/backgrounds/profile-bg.jpg" style={{ height: 111, objectFit: "cover" }} alt="cover" />
              <div className="text-center p-7" style={{ marginTop: -56 }}>
                <img src="/assets/images/profile/user-1.jpg" alt="user" className="rounded-circle shadow-sm border border-3 border-white" width="112" height="112" />
                <h3 className="mb-1 mt-3">Angela Dominic</h3>
                <p className="fs-3 text-muted">Web Designer &amp; Developer</p>
                <a href="#" onClick={(e) => e.preventDefault()} className="btn btn-primary btn-rounded mb-4">Follow</a>
                <div className="row gx-lg-4 text-center pt-7 justify-content-center border-top">
                  <div className="col-4"><h3 className="mb-0">1099</h3><small className="text-muted fs-3">Articles</small></div>
                  <div className="col-4"><h3 className="mb-0">23,469</h3><small className="text-muted fs-3">Followers</small></div>
                  <div className="col-4"><h3 className="mb-0">6035</h3><small className="text-muted fs-3">Following</small></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

const CONTACTS = [
  { img: "/assets/images/profile/user-2.jpg", name: "James Smith", msg: "you were in video call", status: "online" },
  { img: "/assets/images/profile/user-6.jpg", name: "Joseph Garciar", msg: "you were in video call", status: "busy" },
  { img: "/assets/images/profile/user-3.jpg", name: "Maria Rodriguez", msg: "you missed john call", status: "busy" },
  { img: "/assets/images/profile/user-10.jpg", name: "John Mainga", msg: "you missed john call", status: "busy" }
];

const PROJECTS = [
  { img: "/assets/images/profile/user-2.jpg", client: "Sunil Joshi", role: "Web Designer", name: "Digital Agency", priorityLabel: "Low", priorityTone: "primary", budget: "$3.9K" },
  { img: "/assets/images/profile/user-4.jpg", client: "Andrew Liock", role: "Project Manager", name: "Real Homes", priorityLabel: "Medium", priorityTone: "info", budget: "$23.9K" },
  { img: "/assets/images/profile/user-5.jpg", client: "Biaca George", role: "Developer", name: "MedicalPro Theme", priorityLabel: "High", priorityTone: "secondary", budget: "$12.9K" },
  { img: "/assets/images/profile/user-6.jpg", client: "Nirav Joshi", role: "Frontend Eng", name: "Elite Admin", priorityLabel: "Very High", priorityTone: "danger", budget: "$2.6K" }
];

/** US regions visual — placeholder for the jvectormap US map. Dots positioned
 * roughly where Vally, New York, Kansas land geographically, with the MP color
 * palette. Visually communicates the same data as the original map. */
function UsRegionsViz() {
  return (
    <svg viewBox="0 0 320 200" width="100%" height="100%" style={{ maxHeight: 220 }} aria-label="US regions visualization">
      <defs>
        <filter id="bonoitec-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" />
        </filter>
      </defs>
      {/* Stylised US outline */}
      <path
        d="M40 90 L80 60 L130 50 L180 55 L220 50 L260 65 L290 95 L280 130 L260 145 L220 155 L180 150 L140 145 L100 150 L60 135 Z"
        fill="#c9d6de"
        stroke="#a9b8c2"
        strokeWidth="1.5"
        opacity="0.7"
      />
      {/* Markers */}
      <g>
        {/* Valley — SF area */}
        <circle cx="60" cy="120" r="14" fill="#26c6da" opacity="0.3" filter="url(#bonoitec-glow)" />
        <circle cx="60" cy="120" r="6" fill="#26c6da" />
        {/* Kansas — center */}
        <circle cx="170" cy="115" r="14" fill="#fc4b6c" opacity="0.3" filter="url(#bonoitec-glow)" />
        <circle cx="170" cy="115" r="6" fill="#fc4b6c" />
        {/* New York — east */}
        <circle cx="265" cy="85" r="14" fill="#1e88e5" opacity="0.3" filter="url(#bonoitec-glow)" />
        <circle cx="265" cy="85" r="6" fill="#1e88e5" />
      </g>
    </svg>
  );
}
