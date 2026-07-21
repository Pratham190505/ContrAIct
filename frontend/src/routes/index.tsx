import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import {
  ArrowRight,
  ShieldCheck,
  FileSearch,
  Sparkles,
  Brain,
  ScanLine,
  MessageSquare,
  ClipboardCheck,
  Github,
  Linkedin,
  Twitter,
  Check,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RiskGauge } from "@/components/app/risk-gauge";
import { RiskBadge } from "@/components/app/risk-badge";
import { ThemeToggle } from "@/components/theme-toggle";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ContrAIct — Understand Every Contract Before You Sign" },
      {
        name: "description",
        content:
          "ContrAIct is an AI-powered contract risk analyzer. Upload any agreement and get a plain-English summary, risk score, and clause-by-clause negotiation tips powered by Self-Healing RAG.",
      },
      { property: "og:title", content: "ContrAIct — AI Contract Risk Analyzer" },
      {
        property: "og:description",
        content:
          "Upload a contract. Get a risk score, plain-English explanations, and clause-by-clause negotiation tips in seconds.",
      },
    ],
  }),
  component: Landing,
});

const stats = [
  { value: "12k+", label: "Contracts analyzed" },
  { value: "94%", label: "Avg. RAG confidence" },
  { value: "8s", label: "Median time to summary" },
  { value: "180+", label: "Clause types detected" },
];

const features = [
  {
    icon: ScanLine,
    title: "OCR + Smart Extraction",
    body: "Drop PDFs, DOCX, or scanned images. PaddleOCR converts pixels to text and chunks it for retrieval.",
  },
  {
    icon: Brain,
    title: "Self-Healing RAG",
    body: "A Critic validates every answer; a Reformulator retries until evidence is solid. Fewer hallucinations.",
  },
  {
    icon: ShieldCheck,
    title: "Risk Scoring",
    body: "Each clause gets Low / Medium / High with a reason, consequences, and negotiation advice.",
  },
  {
    icon: FileSearch,
    title: "Clause Extraction",
    body: "Termination, IP, non-compete, liability, payment, confidentiality — surfaced and explained in plain English.",
  },
  {
    icon: MessageSquare,
    title: "Chat with Contract",
    body: "Ask anything. Answers are grounded in citations from your actual document, not the model's memory.",
  },
  {
    icon: ClipboardCheck,
    title: "Reports & Tracking",
    body: "Downloadable PDF report, obligations tracker, renewal/expiry timeline, and version-diff comparison.",
  },
];

const process = [
  { step: "01", title: "Upload", body: "PDF, DOCX, or image — even scanned contracts." },
  { step: "02", title: "Extract", body: "Text extraction or OCR, then chunking + embeddings." },
  { step: "03", title: "Self-Healing RAG", body: "Retriever → Generator → Critic → Reformulator loop." },
  { step: "04", title: "Insights", body: "Risk score, summary, clauses, dates, and negotiation tips." },
];

const testimonials = [
  {
    quote:
      "ContrAIct caught a 24-month non-compete I would have signed. The negotiation tip alone saved me from a year of headaches.",
    name: "Maya R.",
    role: "Senior Engineer",
  },
  {
    quote:
      "I sent my apartment lease in and had a plain-English breakdown in 10 seconds. The Self-Healing RAG actually explains itself.",
    name: "Daniel K.",
    role: "First-time renter",
  },
  {
    quote:
      "We use ContrAIct to triage vendor MSAs before legal review. It cut our intake time roughly in half.",
    name: "Priya S.",
    role: "Ops Lead, Series B SaaS",
  },
];

export default Landing;

function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Nav */}
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link to="/" className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl brand-gradient text-primary-foreground shadow">
              <Sparkles className="h-4 w-4" />
            </div>
            <div className="leading-tight">
              <p className="font-display text-base font-semibold">
                Contr<span className="text-primary">AI</span>ct
              </p>
              <p className="text-[10px] text-muted-foreground">AI contract risk analyzer</p>
            </div>
          </Link>
          <nav className="hidden items-center gap-8 text-sm md:flex">
            <a href="#features" className="text-muted-foreground hover:text-foreground">Features</a>
            <a href="#how" className="text-muted-foreground hover:text-foreground">How it works</a>
            <a href="#preview" className="text-muted-foreground hover:text-foreground">Preview</a>
            <a href="#testimonials" className="text-muted-foreground hover:text-foreground">Reviews</a>
          </nav>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button asChild className="brand-gradient text-primary-foreground shadow-sm">
              <Link to="/app">
                Launch app
                <ArrowRight className="ml-1.5 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="brand-radial pointer-events-none absolute inset-0" aria-hidden />
        <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-4 py-20 sm:px-6 lg:grid-cols-12 lg:gap-8 lg:px-8 lg:py-28">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="lg:col-span-7"
          >
            <Badge variant="outline" className="border-primary/30 bg-primary/5 text-primary">
              <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-primary" />
              AI CONTRACT RISK ANALYZER
            </Badge>
            <h1 className="mt-5 font-display text-5xl font-semibold leading-[1.05] tracking-tight sm:text-6xl lg:text-7xl">
              Understand every <br />
              contract before <br />
              you <span className="text-brand-gradient">sign.</span>
            </h1>
            <p className="mt-6 max-w-xl text-base text-muted-foreground sm:text-lg">
              Upload an employment offer, lease, NDA, or vendor MSA. ContrAIct extracts every clause,
              scores risk, explains it in plain English, and tells you exactly what to negotiate —
              backed by a Self-Healing RAG pipeline that grades its own answers.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg" className="brand-gradient text-primary-foreground shadow-lg">
                <Link to="/app/upload">
                  Analyze a contract
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link to="/app">See live demo</Link>
              </Button>
            </div>
            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
              {["PDF, DOCX & scanned images", "OCR included", "No legal jargon", "Citations on every answer"].map((t) => (
                <span key={t} className="inline-flex items-center gap-1.5">
                  <Check className="h-3.5 w-3.5 text-primary" />
                  {t}
                </span>
              ))}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="relative lg:col-span-5"
          >
            <div className="absolute -inset-6 brand-gradient opacity-20 blur-3xl" aria-hidden />
            <Card className="relative overflow-hidden p-6 shadow-2xl">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Acme Inc. – Employment Offer</p>
                  <p className="font-display text-lg font-semibold">Overall risk</p>
                </div>
                <RiskBadge level="high" />
              </div>
              <div className="mt-4 flex items-center justify-center">
                <RiskGauge score={72} size={170} />
              </div>
              <div className="mt-4 space-y-2.5">
                {[
                  { name: "Non-compete (24 months)", risk: "high" as const },
                  { name: "IP assignment (broad)", risk: "high" as const },
                  { name: "Signing bonus clawback", risk: "medium" as const },
                  { name: "At-will termination", risk: "low" as const },
                ].map((c) => (
                  <div key={c.name} className="flex items-center justify-between rounded-lg border bg-card/50 px-3 py-2">
                    <span className="text-xs font-medium">{c.name}</span>
                    <RiskBadge level={c.risk} />
                  </div>
                ))}
              </div>
            </Card>
          </motion.div>
        </div>

        {/* stats */}
        <div className="relative mx-auto max-w-7xl px-4 pb-16 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border bg-border md:grid-cols-4">
            {stats.map((s) => (
              <div key={s.label} className="bg-card p-6 text-center">
                <p className="font-display text-3xl font-semibold text-primary">{s.value}</p>
                <p className="mt-1 text-xs uppercase tracking-wider text-muted-foreground">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">— What it does</p>
          <h2 className="mt-3 font-display text-4xl font-semibold sm:text-5xl">
            Everything you need to read <span className="text-primary">smarter.</span>
          </h2>
        </div>
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.05 }}
            >
              <Card className="h-full p-6 transition-shadow hover:shadow-lg">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <f.icon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 font-display text-lg font-semibold">{f.title}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">{f.body}</p>
              </Card>
            </motion.div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="border-y bg-secondary/40 py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-12 lg:grid-cols-12">
            <div className="lg:col-span-4">
              <p className="text-xs font-semibold uppercase tracking-widest text-primary">— Our process</p>
              <h2 className="mt-3 font-display text-4xl font-semibold">How ContrAIct works</h2>
              <p className="mt-4 text-sm text-muted-foreground">
                A Self-Healing RAG pipeline grounds every answer in your document — and grades itself before
                showing you the result.
              </p>
            </div>
            <div className="grid gap-5 sm:grid-cols-2 lg:col-span-8">
              {process.map((p) => (
                <Card key={p.step} className="p-6">
                  <p className="font-display text-3xl font-semibold text-primary/30">{p.step}</p>
                  <h3 className="mt-2 font-display text-lg font-semibold">{p.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{p.body}</p>
                </Card>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Preview */}
      <section id="preview" className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-primary">— Inside the dashboard</p>
            <h2 className="mt-3 font-display text-4xl font-semibold">
              A workspace that reads <span className="text-primary">with you.</span>
            </h2>
            <p className="mt-4 text-sm text-muted-foreground">
              A collapsible left sidebar keeps every tool one click away — Upload, Contracts, Analysis,
              Clauses, Chat, Timeline, Obligations, and Reports.
            </p>
            <ul className="mt-6 space-y-2 text-sm">
              {[
                "Risk score with category-wise breakdown",
                "Clause cards with plain-English rewrites",
                "Chat with citations from the source document",
                "Renewal & expiry timeline auto-extracted",
              ].map((t) => (
                <li key={t} className="flex items-start gap-2">
                  <Check className="mt-0.5 h-4 w-4 text-primary" />
                  <span>{t}</span>
                </li>
              ))}
            </ul>
            <Button asChild className="mt-8 brand-gradient text-primary-foreground">
              <Link to="/app">
                Open dashboard
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
          <Card className="overflow-hidden p-0 shadow-xl">
            <div className="border-b bg-secondary/60 px-4 py-2 text-xs text-muted-foreground">
              contraict.app / app / analysis
            </div>
            <div className="grid grid-cols-12 gap-0">
              <div className="col-span-3 border-r bg-sidebar p-3 text-[11px]">
                {["Dashboard", "Upload", "Contracts", "Analysis", "Clauses", "Chat", "Timeline"].map((n, i) => (
                  <div
                    key={n}
                    className={`mb-1 rounded-md px-2 py-1.5 ${
                      i === 3 ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground"
                    }`}
                  >
                    {n}
                  </div>
                ))}
              </div>
              <div className="col-span-9 p-4">
                <div className="flex items-center justify-between">
                  <p className="font-display text-sm font-semibold">Acme – Employment Offer</p>
                  <RiskBadge level="high" />
                </div>
                <div className="mt-3 flex items-center gap-3">
                  <RiskGauge score={72} size={110} />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-2 w-full rounded bg-muted">
                      <div className="h-2 w-3/4 rounded brand-gradient" />
                    </div>
                    <div className="h-2 w-2/3 rounded bg-muted">
                      <div className="h-2 w-1/2 rounded brand-gradient" />
                    </div>
                    <div className="h-2 w-5/6 rounded bg-muted">
                      <div className="h-2 w-2/5 rounded brand-gradient" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </section>

      {/* Testimonials */}
      <section id="testimonials" className="border-t bg-secondary/40 py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <p className="text-xs font-semibold uppercase tracking-widest text-primary">— What people say</p>
            <h2 className="mt-3 font-display text-4xl font-semibold">Built for the moment before you sign.</h2>
          </div>
          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {testimonials.map((t) => (
              <Card key={t.name} className="p-6">
                <div className="text-xs text-primary">★★★★★</div>
                <p className="mt-3 text-sm leading-relaxed">"{t.quote}"</p>
                <p className="mt-4 text-xs font-medium">
                  {t.name} <span className="text-muted-foreground">· {t.role}</span>
                </p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <Card className="overflow-hidden p-0">
          <div className="brand-gradient relative px-8 py-12 text-primary-foreground sm:px-14 sm:py-16">
            <div className="grid gap-8 lg:grid-cols-2 lg:items-center">
              <div>
                <h2 className="font-display text-3xl font-semibold sm:text-4xl">
                  Don't sign blind. <br />Let ContrAIct read it first.
                </h2>
                <p className="mt-3 max-w-md text-sm opacity-90">
                  Get a risk score, plain-English summary, and clause-by-clause negotiation tips in under a minute.
                </p>
              </div>
              <div className="flex flex-wrap gap-3 lg:justify-end">
                <Button asChild size="lg" variant="secondary">
                  <Link to="/app/upload">
                    Analyze a contract
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline" className="border-white/40 bg-transparent text-white hover:bg-white/10 hover:text-white">
                  <Link to="/app">Open dashboard</Link>
                </Button>
              </div>
            </div>
          </div>
        </Card>
      </section>

      {/* Footer */}
      <footer className="border-t">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
          <div className="grid gap-8 md:grid-cols-4">
            <div>
              <Link to="/" className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg brand-gradient text-primary-foreground">
                  <Sparkles className="h-4 w-4" />
                </div>
                <span className="font-display font-semibold">
                  Contr<span className="text-primary">AI</span>ct
                </span>
              </Link>
              <p className="mt-3 text-xs text-muted-foreground">AI contract risk analyzer for everyone who's about to sign something.</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider">Product</p>
              <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                <li><Link to="/app">Dashboard</Link></li>
                <li><Link to="/app/upload">Upload</Link></li>
                <li><Link to="/app/chat">Chat</Link></li>
                <li><Link to="/app/reports">Reports</Link></li>
              </ul>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider">Company</p>
              <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                <li>About</li>
                <li>Privacy</li>
                <li>Security</li>
                <li>Contact</li>
              </ul>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider">Follow</p>
              <div className="mt-3 flex items-center gap-3 text-muted-foreground">
                <Github className="h-4 w-4" />
                <Twitter className="h-4 w-4" />
                <Linkedin className="h-4 w-4" />
              </div>
            </div>
          </div>
          <p className="mt-10 text-xs text-muted-foreground">© 2026 ContrAIct. Not legal advice.</p>
        </div>
      </footer>
    </div>
  );
}
