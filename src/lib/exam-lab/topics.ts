// src/lib/exam-lab/topics.ts
//
// The Exam Lab syllabus topic lists. Client-safe (no questions, no answers):
// the practice builder imports these, and bank.ts re-exports them, so the
// browser never has to load the seed bank (its `ans` and `scheme`) just to
// list the topics. See scripts/check-exam-lab-client-imports.mjs.

export const TOPICS = {
  AS: [
    "Physical quantities & units","Kinematics","Dynamics","Forces, density & pressure",
    "Work, energy & power","Deformation of solids","Waves","Superposition",
    "Electricity","D.C. circuits","Particle physics"
  ],
  A2: [
    "Circular motion","Gravitational fields","Thermal physics","Ideal gases",
    "Oscillations","Electric fields","Capacitance","Magnetic fields",
    "Alternating currents","Quantum physics","Nuclear physics","Astronomy & cosmology"
  ],
  // Cambridge O Level Physics (5054) — public syllabus structure. Distinct topic
  // tags keep O-Level drills fully separate from 9702 drawing (topic-based pool).
  OL: [
    "Measurements & units","Kinematics","Dynamics & forces","Mass, weight & density",
    "Turning effects & pressure","Energy, work & power","Momentum",
    "Kinetic model & thermal properties","Transfer of thermal energy",
    "General wave properties","Light & optics","Electromagnetic spectrum & sound",
    "Magnetism","Electrical quantities & circuits","Practical electricity & safety",
    "Electromagnetic effects","Radioactivity & the nuclear atom"
  ]
};
