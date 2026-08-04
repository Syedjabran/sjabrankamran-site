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
  return (
    <Link href={href} className={cn(variant === "primary" ? "btn-primary" : "btn-ghost", className)}>
      {children}
      <ArrowRight size={16} />
    </Link>
  );
}
