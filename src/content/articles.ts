/**
 * Draft article catalogue. Education-first.
 * These are DRAFTS prepared for JB's approval — not published claims.
 * Full bodies live in Supabase once approved; here we carry teasers + status.
 */

export type Article = {
  slug: string;
  title: string;
  category: string;
  group: "physics" | "professional";
  excerpt: string;
  readMinutes: number;
  status: "draft" | "published";
  authorship: "written" | "ai_assisted";
};

export const articleCategories = {
  physics: [
    "Physics Concepts", "A-Level Physics", "O-Level Physics", "IBDP Physics",
    "Practical Physics", "Examination Technique", "Common Student Mistakes",
    "Problem-Solving", "University Preparation", "AI in Education",
  ],
  professional: [
    "Teaching & Educational Leadership", "Entrepreneurship", "Business Strategy",
    "AI & Automation", "Technology Systems", "Industrial Performance",
    "Leadership & Institution Building",
  ],
};

export const articles: Article[] = [
  {
    slug: "think-in-physics-not-memorise",
    title: "How to Think in Physics Instead of Memorising Solutions",
    category: "Problem-Solving",
    group: "physics",
    excerpt: "The students who struggle most often know every formula. The gap isn't knowledge — it's how they reason. Here's how to build genuine physical intuition.",
    readMinutes: 7,
    status: "draft",
    authorship: "written",
  },
  {
    slug: "why-students-struggle-alevel-physics",
    title: "Why Students Struggle With A-Level Physics Even When They Know the Formulae",
    category: "A-Level Physics",
    group: "physics",
    excerpt: "Knowing the equation is not knowing the physics. A look at the real reasons capable students lose marks — and how to fix each one.",
    readMinutes: 6,
    status: "draft",
    authorship: "written",
  },
  {
    slug: "practical-planning-questions",
    title: "The Correct Way to Approach Practical Planning Questions",
    category: "Practical Physics",
    group: "physics",
    excerpt: "Planning questions reward a specific structure. Here's the method examiners are actually looking for — variables, control, and measurable outcomes.",
    readMinutes: 8,
    status: "draft",
    authorship: "written",
  },
  {
    slug: "graphical-data-analysis-errors",
    title: "Common Graphical and Data-Analysis Errors in Physics",
    category: "Common Student Mistakes",
    group: "physics",
    excerpt: "Axes, gradients, intercepts, uncertainty bars — the small graph mistakes that quietly cost marks, and how to stop making them.",
    readMinutes: 6,
    status: "draft",
    authorship: "written",
  },
  {
    slug: "ai-for-physics-students",
    title: "How AI Should — and Should Not — Be Used by Physics Students",
    category: "AI in Education",
    group: "physics",
    excerpt: "AI can accelerate learning or quietly replace it. A teacher's framework for using AI to understand more, not think less.",
    readMinutes: 7,
    status: "draft",
    authorship: "ai_assisted",
  },
  {
    slug: "olevel-to-alevel-physics",
    title: "From O-Level to A-Level Physics: What Actually Changes",
    category: "A-Level Physics",
    group: "physics",
    excerpt: "The jump is real, but it's not about harder maths. It's about depth, precision, and independence. What to expect and how to prepare.",
    readMinutes: 6,
    status: "draft",
    authorship: "written",
  },
  {
    slug: "understanding-uncertainty",
    title: "Understanding Uncertainty Rather Than Memorising Rules",
    category: "Examination Technique",
    group: "physics",
    excerpt: "Uncertainty isn't a set of rules to memorise — it's a way of being honest about measurement. Once that clicks, the rules follow.",
    readMinutes: 7,
    status: "draft",
    authorship: "written",
  },
  {
    slug: "examiner-language",
    title: "How Examiner Language Can Improve Physics Answers",
    category: "Examination Technique",
    group: "physics",
    excerpt: "Mark schemes reward specific phrasing. Learning to write like an examiner is one of the fastest ways to convert understanding into marks.",
    readMinutes: 5,
    status: "draft",
    authorship: "written",
  },
];
