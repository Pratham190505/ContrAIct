export type RiskLevel = "low" | "medium" | "high";

export type Clause = {
  id: string;
  title: string;
  category: string;
  original: string;
  plain: string;
  risk: RiskLevel;
  reason: string;
  consequences: string;
  negotiation: string;
  confidence: number;
};

export type Contract = {
  id: string;
  name: string;
  type: string;
  party: string;
  uploadedAt: string;
  pages: number;
  riskScore: number;
  confidence: number;
  status: "analyzed" | "processing";
  summary: string;
  clauses: Clause[];
  obligations: { party: string; obligation: string; due?: string }[];
  dates: { label: string; date: string; kind: "renewal" | "expiry" | "payment" | "review" }[];
  missing: string[];
  negotiation: string[];
};

export const contracts: Contract[] = [
  {
    id: "c-001",
    name: "Acme Inc. – Employment Offer",
    type: "Employment",
    party: "Acme Inc.",
    uploadedAt: "2026-06-22",
    pages: 14,
    riskScore: 72,
    confidence: 0.94,
    status: "analyzed",
    summary:
      "Standard at-will employment agreement with above-average non-compete scope, a broad IP assignment clause, and a 90-day clawback on signing bonus. Compensation and benefits are clearly defined; termination terms favor the employer.",
    clauses: [
      {
        id: "cl-1",
        title: "Non-Compete",
        category: "Restrictions",
        original:
          "Employee agrees that for a period of twenty-four (24) months following termination, Employee shall not, directly or indirectly, engage in any business that competes with the Company in any geographic region in which the Company operates.",
        plain:
          "You can't work for any competitor anywhere the company does business for 2 years after leaving.",
        risk: "high",
        reason: "Duration and geographic scope are unusually broad and may be unenforceable in some jurisdictions.",
        consequences: "Limits future employment options and may trigger lawsuit if you join a competitor.",
        negotiation: "Reduce to 6–12 months and limit geography to states/countries you actively worked in.",
        confidence: 0.96,
      },
      {
        id: "cl-2",
        title: "IP Assignment",
        category: "Intellectual Property",
        original:
          "All inventions, discoveries, and works of authorship conceived by Employee during employment, whether or not during working hours, shall be the sole property of the Company.",
        plain: "Anything you invent — even on your own time — belongs to the company.",
        risk: "high",
        reason: "Includes work created outside working hours and without company resources.",
        consequences: "Your side projects could be claimed by the company.",
        negotiation: "Carve out inventions made on personal time without company resources.",
        confidence: 0.93,
      },
      {
        id: "cl-3",
        title: "Signing Bonus Clawback",
        category: "Compensation",
        original:
          "If Employee voluntarily terminates employment within 12 months of the Start Date, Employee shall repay 100% of the signing bonus within 30 days.",
        plain: "Quit within a year and you owe the full signing bonus back in 30 days.",
        risk: "medium",
        reason: "Full-amount clawback with short repayment window.",
        consequences: "Financial liability if you leave early.",
        negotiation: "Prorate the clawback by months worked and extend repayment to 90 days.",
        confidence: 0.91,
      },
      {
        id: "cl-4",
        title: "At-Will Termination",
        category: "Termination",
        original:
          "Employment is at-will and may be terminated by either party at any time, with or without cause and with or without notice.",
        plain: "Either side can end the job anytime, for any reason, without notice.",
        risk: "low",
        reason: "Standard US employment language.",
        consequences: "Typical job-security trade-off.",
        negotiation: "Request 2-week notice or severance for involuntary termination without cause.",
        confidence: 0.98,
      },
      {
        id: "cl-5",
        title: "Confidentiality",
        category: "Confidentiality",
        original:
          "Employee shall hold all Confidential Information in strict confidence both during and after employment, in perpetuity.",
        plain: "You must keep company secrets confidential forever.",
        risk: "medium",
        reason: "Perpetual duration with broad definition of confidential information.",
        consequences: "Long-tail liability for accidental disclosure years later.",
        negotiation: "Limit to a defined term (3–5 years) for non-trade-secret material.",
        confidence: 0.89,
      },
    ],
    obligations: [
      { party: "Employee", obligation: "Devote full business time to the company", due: "Ongoing" },
      { party: "Employee", obligation: "Return all company property on termination", due: "On exit" },
      { party: "Company", obligation: "Pay base salary semi-monthly", due: "Bi-weekly" },
      { party: "Company", obligation: "Provide health benefits after 30 days", due: "Day 31" },
    ],
    dates: [
      { label: "Start date", date: "2026-07-15", kind: "review" },
      { label: "First performance review", date: "2027-01-15", kind: "review" },
      { label: "Stock vesting cliff", date: "2027-07-15", kind: "renewal" },
      { label: "Non-compete ends", date: "2028-07-15", kind: "expiry" },
    ],
    missing: [
      "Severance terms for involuntary termination",
      "Remote-work policy reference",
      "Dispute resolution / arbitration carve-outs",
    ],
    negotiation: [
      "Tighten non-compete to 12 months and relevant geography only",
      "Carve out personal-time IP",
      "Prorate signing-bonus clawback",
      "Add severance: 2 weeks per year of service",
    ],
  },
  {
    id: "c-002",
    name: "Riverside Apartments – Lease Agreement",
    type: "Rental",
    party: "Riverside Property LLC",
    uploadedAt: "2026-06-18",
    pages: 22,
    riskScore: 58,
    confidence: 0.91,
    status: "analyzed",
    summary:
      "12-month residential lease with auto-renewal, above-market late fees, and broad landlord entry rights. Security deposit handling and utility responsibilities are clearly defined.",
    clauses: [],
    obligations: [
      { party: "Tenant", obligation: "Pay rent by 1st of month", due: "Monthly" },
      { party: "Landlord", obligation: "Maintain habitability", due: "Ongoing" },
    ],
    dates: [
      { label: "Lease start", date: "2026-08-01", kind: "review" },
      { label: "Lease ends / auto-renews", date: "2027-08-01", kind: "renewal" },
      { label: "Rent due", date: "2026-08-01", kind: "payment" },
    ],
    missing: ["Mold remediation timeline", "Subletting policy"],
    negotiation: ["Cap late fees at 5%", "Require 24h notice for entry"],
  },
  {
    id: "c-003",
    name: "Mutual NDA – Northstar Labs",
    type: "NDA",
    party: "Northstar Labs",
    uploadedAt: "2026-06-10",
    pages: 6,
    riskScore: 28,
    confidence: 0.97,
    status: "analyzed",
    summary: "Mutual NDA with 3-year confidentiality period and standard carve-outs.",
    clauses: [],
    obligations: [],
    dates: [
      { label: "Effective date", date: "2026-06-10", kind: "review" },
      { label: "Confidentiality ends", date: "2029-06-10", kind: "expiry" },
    ],
    missing: [],
    negotiation: [],
  },
  {
    id: "c-004",
    name: "Freelance MSA – Bluepeak Studio",
    type: "Freelance",
    party: "Bluepeak Studio",
    uploadedAt: "2026-06-02",
    pages: 11,
    riskScore: 65,
    confidence: 0.9,
    status: "analyzed",
    summary: "Master services agreement with unlimited revisions clause and net-60 payment terms.",
    clauses: [],
    obligations: [],
    dates: [
      { label: "First invoice due", date: "2026-08-01", kind: "payment" },
      { label: "Engagement ends", date: "2026-12-31", kind: "expiry" },
    ],
    missing: ["Late-payment interest", "Kill fee on cancellation"],
    negotiation: ["Switch to net-30", "Cap revisions at 3 rounds per deliverable"],
  },
];

export const sampleChat = [
  { role: "user", text: "What happens if I quit within the first year?" },
  {
    role: "assistant",
    text:
      "Per Section 4.2 of your Acme employment offer, you'd owe back 100% of the $25,000 signing bonus within 30 days of resignation. The non-compete (Section 9.1) also activates immediately on departure for 24 months.",
    cites: ["§ 4.2 Signing Bonus", "§ 9.1 Non-Compete"],
  },
  { role: "user", text: "Is the non-compete enforceable in California?" },
  {
    role: "assistant",
    text:
      "California generally voids non-compete agreements under Business & Professions Code § 16600. The 24-month restriction would likely be unenforceable for California-based work, though confidentiality and trade-secret protections remain valid.",
    cites: ["§ 9.1 Non-Compete", "§ 8 Confidentiality"],
  },
];

export const riskCategories = [
  { name: "Termination", value: 18 },
  { name: "IP / Ownership", value: 24 },
  { name: "Liability", value: 14 },
  { name: "Payment", value: 11 },
  { name: "Confidentiality", value: 9 },
  { name: "Non-compete", value: 24 },
];

export function getContract(id: string) {
  return contracts.find((c) => c.id === id) ?? contracts[0];
}
