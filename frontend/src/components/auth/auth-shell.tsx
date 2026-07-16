import { Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { FileSearch, ShieldCheck, Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { ThemeToggle } from "@/components/theme-toggle";

type AuthShellProps = {
  children: ReactNode;
  title: string;
  description: string;
};

export function AuthShell({ children, title, description }: AuthShellProps) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="brand-radial pointer-events-none fixed inset-0" aria-hidden />
      <header className="relative z-10 mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
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
        <ThemeToggle />
      </header>

      <main className="relative z-10 mx-auto grid min-h-[calc(100vh-4rem)] max-w-7xl items-center gap-10 px-4 py-8 sm:px-6 lg:grid-cols-12 lg:px-8">
        <motion.section
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
          className="hidden lg:col-span-6 lg:block"
        >
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">
            Secure contract intelligence
          </p>
          <h1 className="mt-4 font-display text-5xl font-semibold leading-tight">
            Your private workspace for every agreement.
          </h1>
          <p className="mt-5 max-w-xl text-sm leading-6 text-muted-foreground">
            Sign in to upload contracts, review risks, track obligations, and keep every AI answer grounded in your documents.
          </p>
          <div className="mt-8 grid max-w-xl gap-3">
            {[
              { icon: ShieldCheck, text: "JWT-protected dashboard and private API routes" },
              { icon: FileSearch, text: "Contract analysis tied to your user account" },
              { icon: Sparkles, text: "Self-healing RAG insights saved for later review" },
            ].map((item) => (
              <div key={item.text} className="flex items-center gap-3 rounded-lg border bg-card/60 px-4 py-3 shadow-sm backdrop-blur">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <item.icon className="h-4 w-4" />
                </div>
                <span className="text-sm font-medium">{item.text}</span>
              </div>
            ))}
          </div>
        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.05 }}
          className="mx-auto w-full max-w-md lg:col-span-6"
        >
          <Card className="overflow-hidden p-0 shadow-2xl">
            <div className="border-b bg-secondary/50 px-6 py-5">
              <h2 className="font-display text-2xl font-semibold">{title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{description}</p>
            </div>
            <div className="p-6">{children}</div>
          </Card>
        </motion.section>
      </main>
    </div>
  );
}
