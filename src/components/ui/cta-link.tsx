import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

export function CtaLink({
  href,
  children,
  variant = "primary",
  className,
}: {
  href: string;
  children: React.ReactNode;
  variant?: "primary" | "ghost";
  className?: string;
}) {
  const base =
    "inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-medium transition-all duration-300";
  const variants = {
    primary: "bg-gold text-midnight hover:bg-gold-soft",
    ghost: "border border-ivory/20 text-ivory hover:border-gold hover:text-gold",
  };
  return (
    <Link href={href} className={cn(base, variants[variant], className)}>
      {children}
      <ArrowRight size={16} />
    </Link>
  );
}
