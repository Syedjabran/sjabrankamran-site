// Auto-derived from the Exam Lab seed bank. Original, CAIE 9702 (2025-2027)-aligned
// practice questions authored by the site owner. Serves as the public AI fallback
// pool AND the portal "exact-pattern" starter bank until real past papers are ingested.

export type ELLevel = "LOT" | "HOT";
export type ELType = "mcq" | "structured";
export type ELCourse = "9702" | "5054" | "IB";
export type ELQuestion = {
  id: string;
  t: string;            // topic
  lvl: ELLevel;
  type: ELType;
  paper: "P1" | "P2" | "P4";
  cmd: string;          // command word
  marks: number;
  stem: string;         // KaTeX ($...$) allowed
  opts?: string[];      // mcq options
  ans?: number;         // mcq correct index (0-based)
  scheme: string[];     // marking points / model answer
  visibility?: "public" | "portal" | "both";
  source?: string;
  course?: ELCourse;    // awarding-body course; undefined ⇒ "9702" (backward-compatible)
};

/** Course of a bank item; legacy 9702 entries omit the field. */
export function courseOf(q: ELQuestion): ELCourse {
  return q.course ?? "9702";
}

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

const RAW: Omit<ELQuestion,"id">[] = [
  // ---------- Physical quantities & units ----------
  {t:"Physical quantities & units",lvl:"LOT",type:"mcq",paper:"P1",cmd:"State",marks:1,
   stem:"Which of the following is a set of only SI base units?",
   opts:["$\\mathrm{kg,\\ m,\\ s,\\ A}$","$\\mathrm{N,\\ m,\\ s,\\ K}$","$\\mathrm{kg,\\ m,\\ J,\\ A}$","$\\mathrm{kg,\\ m,\\ s,\\ N}$"],
   ans:0, scheme:["Base units are kg, m, s, A, K, mol, cd.","N and J are derived units → options with them are wrong."]},
  {t:"Physical quantities & units",lvl:"HOT",type:"structured",paper:"P2",cmd:"Show that",marks:3,
   stem:"The drag force $F$ on a sphere of radius $r$ moving at speed $v$ through a fluid of viscosity $\\eta$ is thought to be $F = k\\,\\eta\\, r\\, v$, where $k$ is a dimensionless constant. Show that this equation is homogeneous, given that $\\eta$ has units $\\mathrm{kg\\,m^{-1}\\,s^{-1}}$.",
   scheme:["LHS: $[F]=\\mathrm{kg\\,m\\,s^{-2}}$ (N).","RHS: $[\\eta][r][v]=(\\mathrm{kg\\,m^{-1}\\,s^{-1}})(\\mathrm m)(\\mathrm{m\\,s^{-1}})$.","RHS $=\\mathrm{kg\\,m\\,s^{-2}}$ = LHS → homogeneous ($k$ dimensionless)."]},

  // ---------- Kinematics ----------
  {t:"Kinematics",lvl:"LOT",type:"mcq",paper:"P1",cmd:"Calculate",marks:1,
   stem:"A ball is thrown vertically upward at $20\\,\\mathrm{m\\,s^{-1}}$. Taking $g=9.81\\,\\mathrm{m\\,s^{-2}}$ and ignoring air resistance, the time to reach maximum height is approximately",
   opts:["$1.0\\,\\mathrm s$","$2.0\\,\\mathrm s$","$4.1\\,\\mathrm s$","$0.5\\,\\mathrm s$"],
   ans:1, scheme:["At max height $v=0$: $t=u/g = 20/9.81$.","$t \\approx 2.0\\,\\mathrm s$."]},
  {t:"Kinematics",lvl:"HOT",type:"structured",paper:"P2",cmd:"Explain",marks:4,
   stem:"A projectile is launched at $30\\,\\mathrm{m\\,s^{-1}}$ at $40^\\circ$ above the horizontal. (a) Explain why the horizontal component of velocity stays constant while the vertical component changes. (b) Calculate the horizontal range (take $g=9.81\\,\\mathrm{m\\,s^{-2}}$, ignore air resistance).",
   scheme:["(a) No horizontal force acts (air resistance ignored) → no horizontal acceleration → $v_x$ constant.","(a) Weight acts vertically → constant downward acceleration $g$ → $v_y$ changes.","(b) $u_x=30\\cos40=22.98$, $u_y=30\\sin40=19.28$; time of flight $t=2u_y/g=3.93\\,\\mathrm s$.","(b) Range $=u_x t = 22.98\\times3.93 \\approx 90\\,\\mathrm m$."]},

  // ---------- Dynamics ----------
  {t:"Dynamics",lvl:"LOT",type:"mcq",paper:"P1",cmd:"Calculate",marks:1,
   stem:"A $2.0\\,\\mathrm{kg}$ trolley moving at $3.0\\,\\mathrm{m\\,s^{-1}}$ collides and sticks to a stationary $1.0\\,\\mathrm{kg}$ trolley. Their common velocity after impact is",
   opts:["$1.0\\,\\mathrm{m\\,s^{-1}}$","$1.5\\,\\mathrm{m\\,s^{-1}}$","$2.0\\,\\mathrm{m\\,s^{-1}}$","$3.0\\,\\mathrm{m\\,s^{-1}}$"],
   ans:2, scheme:["Conservation of momentum: $2.0\\times3.0 = (2.0+1.0)v$.","$v = 6.0/3.0 = 2.0\\,\\mathrm{m\\,s^{-1}}$."]},
  {t:"Dynamics",lvl:"HOT",type:"structured",paper:"P4",cmd:"Explain",marks:4,
   stem:"A rocket ejects burnt fuel backwards. Using Newton's laws and the principle of conservation of momentum, explain how the rocket is propelled forwards, even in the vacuum of space.",
   scheme:["Newton's 3rd law: rocket exerts backward force on gas → gas exerts equal forward force on rocket.","Momentum conservation: total momentum of (rocket + gas) is conserved.","Gas gains backward momentum → rocket gains equal forward momentum.","No external medium needed → works in vacuum."]},

  // ---------- Forces, density & pressure ----------
  {t:"Forces, density & pressure",lvl:"LOT",type:"mcq",paper:"P1",cmd:"Determine",marks:1,
   stem:"A uniform beam of weight $40\\,\\mathrm N$ and length $2.0\\,\\mathrm m$ rests on a pivot $0.5\\,\\mathrm m$ from one end. What downward force at that near end keeps it horizontal?",
   opts:["$10\\,\\mathrm N$","$20\\,\\mathrm N$","$40\\,\\mathrm N$","$80\\,\\mathrm N$"],
   ans:2, scheme:["Weight acts at centre, $0.5\\,\\mathrm m$ from pivot on the far side.","Moments about pivot: $F\\times0.5 = 40\\times0.5$.","$F = 40\\,\\mathrm N$."]},
  {t:"Forces, density & pressure",lvl:"HOT",type:"structured",paper:"P2",cmd:"Suggest",marks:3,
   stem:"A hydrometer floats vertically in a liquid. Suggest and explain how the depth to which it sinks changes when it is moved from water to a denser salt solution.",
   scheme:["Floating: upthrust = weight (constant).","Upthrust = $\\rho g V_{disp}$; denser liquid → larger $\\rho$.","To keep upthrust constant, $V_{disp}$ must decrease → it sinks less deep."]},

  // ---------- Work, energy & power ----------
  {t:"Work, energy & power",lvl:"LOT",type:"mcq",paper:"P1",cmd:"Calculate",marks:1,
   stem:"A pump raises $0.50\\,\\mathrm{kg}$ of water per second through a height of $12\\,\\mathrm m$. The minimum output power is (take $g=9.81\\,\\mathrm{m\\,s^{-2}}$)",
   opts:["$5.9\\,\\mathrm W$","$59\\,\\mathrm W$","$120\\,\\mathrm W$","$24\\,\\mathrm W$"],
   ans:1, scheme:["$P = \\dfrac{\\Delta(mgh)}{\\Delta t} = 0.50\\times9.81\\times12$.","$P \\approx 59\\,\\mathrm W$."]},
  {t:"Work, energy & power",lvl:"HOT",type:"structured",paper:"P2",cmd:"Explain",marks:4,
   stem:"A car of mass $1200\\,\\mathrm{kg}$ travels at constant speed up a $5.0^\\circ$ incline. (a) Explain why, despite moving, its kinetic energy does not change. (b) Calculate the useful power output against gravity at $15\\,\\mathrm{m\\,s^{-1}}$ (take $g=9.81$).",
   scheme:["(a) Constant speed → KE $=\\tfrac12mv^2$ unchanged; driving force balances resistive + gravity components (resultant force zero).","(b) Gravity component along slope $=mg\\sin\\theta = 1200\\times9.81\\times\\sin5^\\circ = 1026\\,\\mathrm N$.","(b) $P = Fv = 1026\\times15$.","(b) $P \\approx 1.5\\times10^4\\,\\mathrm W\\ (15\\,\\mathrm{kW})$."]},

  // ---------- Deformation of solids ----------
  {t:"Deformation of solids",lvl:"LOT",type:"mcq",paper:"P1",cmd:"Define",marks:1,
   stem:"The Young modulus of a material is defined as",
   opts:["stress × strain","stress ÷ strain (in the elastic region)","force ÷ extension","strain ÷ stress"],
   ans:1, scheme:["Young modulus $E = \\dfrac{\\text{stress}}{\\text{strain}}$ within the limit of proportionality.","Units: Pa."]},
  {t:"Deformation of solids",lvl:"HOT",type:"structured",paper:"P2",cmd:"Determine",marks:4,
   stem:"A steel wire of length $2.5\\,\\mathrm m$ and cross-sectional area $1.2\\times10^{-6}\\,\\mathrm{m^2}$ stretches by $1.8\\,\\mathrm{mm}$ under a load of $180\\,\\mathrm N$. Determine the Young modulus and comment on one assumption you made.",
   scheme:["Stress $=F/A = 180/1.2\\times10^{-6} = 1.5\\times10^8\\,\\mathrm{Pa}$.","Strain $=x/L = 1.8\\times10^{-3}/2.5 = 7.2\\times10^{-4}$.","$E = $ stress/strain $= 1.5\\times10^8 / 7.2\\times10^{-4} \\approx 2.1\\times10^{11}\\,\\mathrm{Pa}$.","Assumption: wire obeys Hooke's law / limit of proportionality not exceeded."]},

  // ---------- Waves ----------
  {t:"Waves",lvl:"LOT",type:"mcq",paper:"P1",cmd:"Calculate",marks:1,
   stem:"A sound wave has frequency $256\\,\\mathrm{Hz}$ and travels at $340\\,\\mathrm{m\\,s^{-1}}$. Its wavelength is closest to",
   opts:["$0.75\\,\\mathrm m$","$1.33\\,\\mathrm m$","$1.33\\,\\mathrm{cm}$","$87\\,\\mathrm{km}$"],
   ans:1, scheme:["$\\lambda = v/f = 340/256$.","$\\lambda \\approx 1.33\\,\\mathrm m$."]},
  {t:"Waves",lvl:"HOT",type:"structured",paper:"P2",cmd:"Explain",marks:3,
   stem:"Explain what is meant by the intensity of a progressive wave, and state and justify how the intensity depends on amplitude.",
   scheme:["Intensity = power transmitted per unit area (perpendicular to wave direction).","Intensity $\\propto$ (amplitude)$^2$.","Justify: energy of oscillation $\\propto A^2$, so power (and intensity) $\\propto A^2$."]},

  // ---------- Superposition ----------
  {t:"Superposition",lvl:"LOT",type:"mcq",paper:"P1",cmd:"Calculate",marks:1,
   stem:"In a double-slit experiment, slit separation $a=0.50\\,\\mathrm{mm}$, screen distance $D=2.0\\,\\mathrm m$, fringe spacing $x=2.4\\,\\mathrm{mm}$. The wavelength is",
   opts:["$300\\,\\mathrm{nm}$","$600\\,\\mathrm{nm}$","$480\\,\\mathrm{nm}$","$1200\\,\\mathrm{nm}$"],
   ans:1, scheme:["$\\lambda = \\dfrac{ax}{D} = \\dfrac{(0.50\\times10^{-3})(2.4\\times10^{-3})}{2.0}$.","$\\lambda = 6.0\\times10^{-7}\\,\\mathrm m = 600\\,\\mathrm{nm}$."]},
  {t:"Superposition",lvl:"HOT",type:"structured",paper:"P2",cmd:"Suggest",marks:4,
   stem:"A stationary wave forms on a string fixed at both ends. Suggest why nodes and antinodes are produced, and explain how the frequency of the fundamental mode would change if the tension in the string were increased.",
   scheme:["Two waves of equal frequency/amplitude travel in opposite directions (incident + reflected) and superpose.","Nodes: destructive superposition (path difference gives cancellation); antinodes: constructive.","Wave speed $v=\\sqrt{T/\\mu}$ increases with tension; $f=v/2L$ for fundamental.","Higher tension → higher $v$ → higher fundamental frequency."]},

  // ---------- Electricity ----------
  {t:"Electricity",lvl:"LOT",type:"mcq",paper:"P1",cmd:"Calculate",marks:1,
   stem:"A wire of length $2.0\\,\\mathrm m$, cross-section $0.40\\,\\mathrm{mm^2}$ and resistivity $1.7\\times10^{-8}\\,\\Omega\\,\\mathrm m$ has resistance",
   opts:["$0.085\\,\\Omega$","$0.17\\,\\Omega$","$8.5\\,\\Omega$","$0.34\\,\\Omega$"],
   ans:0, scheme:["$R = \\dfrac{\\rho L}{A} = \\dfrac{1.7\\times10^{-8}\\times2.0}{0.40\\times10^{-6}}$.","$R \\approx 0.085\\,\\Omega$."]},
  {t:"Electricity",lvl:"HOT",type:"structured",paper:"P2",cmd:"Explain",marks:3,
   stem:"Explain, in terms of charge carriers, why the resistance of a metallic conductor increases as its temperature rises.",
   scheme:["Higher temperature → lattice ions vibrate with greater amplitude.","More frequent collisions between free electrons and ions → mean drift velocity falls for given p.d.","Lower current for same p.d. → resistance increases."]},

  // ---------- D.C. circuits ----------
  {t:"D.C. circuits",lvl:"LOT",type:"mcq",paper:"P1",cmd:"Determine",marks:1,
   stem:"A cell of e.m.f. $1.5\\,\\mathrm V$ and internal resistance $0.50\\,\\Omega$ drives a current of $0.60\\,\\mathrm A$. The terminal p.d. is",
   opts:["$1.5\\,\\mathrm V$","$1.2\\,\\mathrm V$","$1.8\\,\\mathrm V$","$0.30\\,\\mathrm V$"],
   ans:1, scheme:["$V = \\varepsilon - Ir = 1.5 - 0.60\\times0.50$.","$V = 1.2\\,\\mathrm V$."]},
  {t:"D.C. circuits",lvl:"HOT",type:"structured",paper:"P2",cmd:"Explain",marks:4,
   stem:"A potential divider uses a thermistor and a fixed resistor to switch on a heater when it gets cold. (a) Explain how the output p.d. across the fixed resistor changes as temperature falls. (b) Suggest one advantage of a potential divider over a series variable resistor here.",
   scheme:["(a) As temperature falls, thermistor resistance increases.","(a) It takes a larger share of the supply p.d. → p.d. across fixed resistor decreases (or increases, depending on which component the output is across — must be consistent with stated arrangement).","(b) A potential divider can provide output from zero up to (almost) the full supply p.d.","(b) A series rheostat cannot reduce output to zero / gives limited range."]},

  // ---------- Particle physics ----------
  {t:"Particle physics",lvl:"LOT",type:"mcq",paper:"P1",cmd:"State",marks:1,
   stem:"A neutron is composed of quarks",
   opts:["up, up, down","up, down, down","up, up, up","down, down, down"],
   ans:1, scheme:["Neutron (charge 0) = udd: $+\\tfrac23-\\tfrac13-\\tfrac13 = 0$.","Proton = uud."]},
  {t:"Particle physics",lvl:"HOT",type:"structured",paper:"P2",cmd:"Show that",marks:3,
   stem:"In $\\beta^-$ decay a neutron changes to a proton. Show that the quark composition is consistent with this, and name the other two particles emitted.",
   scheme:["Neutron (udd) → proton (uud): one down quark → up quark.","Charge check: change of $+1$ on the nucleon balanced by emitted electron ($-1$).","Emitted: an electron ($\\beta^-$) and an (electron) antineutrino $\\bar{\\nu}_e$."]},

  // ---------- Circular motion (A2) ----------
  {t:"Circular motion",lvl:"LOT",type:"mcq",paper:"P4",cmd:"Calculate",marks:1,
   stem:"An object of mass $0.20\\,\\mathrm{kg}$ moves in a circle of radius $0.50\\,\\mathrm m$ at $4.0\\,\\mathrm{m\\,s^{-1}}$. The centripetal force is",
   opts:["$1.6\\,\\mathrm N$","$3.2\\,\\mathrm N$","$6.4\\,\\mathrm N$","$0.64\\,\\mathrm N$"],
   ans:2, scheme:["$F = \\dfrac{mv^2}{r} = \\dfrac{0.20\\times4.0^2}{0.50}$.","$F = 6.4\\,\\mathrm N$."]},
  {t:"Circular motion",lvl:"HOT",type:"structured",paper:"P4",cmd:"Explain",marks:4,
   stem:"A car goes over a humpback bridge (arc of a circle) of radius $25\\,\\mathrm m$. (a) Explain why there is a maximum speed above which the car leaves the road at the top. (b) Calculate that speed (take $g=9.81$).",
   scheme:["(a) At the top, $mg - N = \\dfrac{mv^2}{r}$; centripetal force supplied by weight minus normal reaction.","(a) Contact lost when $N=0$ → weight alone provides the centripetal force.","(b) $mg = \\dfrac{mv^2}{r} \\Rightarrow v=\\sqrt{gr} = \\sqrt{9.81\\times25}$.","(b) $v \\approx 15.7\\,\\mathrm{m\\,s^{-1}}$."]},

  // ---------- Gravitational fields (A2) ----------
  {t:"Gravitational fields",lvl:"LOT",type:"mcq",paper:"P4",cmd:"State",marks:1,
   stem:"For a satellite in a circular orbit, which quantity provides the centripetal force?",
   opts:["Air resistance","The gravitational attraction of the Earth","The thrust of its engines","The normal contact force"],
   ans:1, scheme:["Gravitational force between Earth and satellite acts toward Earth's centre.","This is the centripetal force keeping it in orbit."]},
  {t:"Gravitational fields",lvl:"HOT",type:"structured",paper:"P4",cmd:"Show that",marks:4,
   stem:"Show that the period $T$ of a satellite in a circular orbit of radius $r$ around a planet of mass $M$ is given by $T^2 = \\dfrac{4\\pi^2 r^3}{GM}$.",
   scheme:["Gravity provides centripetal force: $\\dfrac{GMm}{r^2} = \\dfrac{mv^2}{r}$.","With $v = \\dfrac{2\\pi r}{T}$: $\\dfrac{GMm}{r^2} = \\dfrac{m}{r}\\left(\\dfrac{2\\pi r}{T}\\right)^2$.","Simplify: $\\dfrac{GM}{r^2} = \\dfrac{4\\pi^2 r}{T^2}$.","Rearrange: $T^2 = \\dfrac{4\\pi^2 r^3}{GM}$ (Kepler's 3rd law)."]},

  // ---------- Thermal physics (A2) ----------
  {t:"Thermal physics",lvl:"LOT",type:"mcq",paper:"P4",cmd:"Calculate",marks:1,
   stem:"How much energy is needed to raise the temperature of $0.30\\,\\mathrm{kg}$ of water by $20\\,\\mathrm K$? (specific heat capacity $=4200\\,\\mathrm{J\\,kg^{-1}\\,K^{-1}}$)",
   opts:["$2.5\\,\\mathrm{kJ}$","$25\\,\\mathrm{kJ}$","$252\\,\\mathrm{kJ}$","$1.3\\,\\mathrm{kJ}$"],
   ans:1, scheme:["$Q = mc\\Delta\\theta = 0.30\\times4200\\times20$.","$Q = 25\\,200\\,\\mathrm J \\approx 25\\,\\mathrm{kJ}$."]},
  {t:"Thermal physics",lvl:"HOT",type:"structured",paper:"P4",cmd:"Explain",marks:3,
   stem:"Explain, in terms of molecular behaviour, why energy is needed to boil a liquid even though its temperature does not rise during boiling.",
   scheme:["Energy (latent heat) does work separating molecules against intermolecular forces.","Potential energy of molecules increases; mean kinetic energy (temperature) unchanged.","Energy also does work pushing back the atmosphere as vapour expands."]},

  // ---------- Ideal gases (A2) ----------
  {t:"Ideal gases",lvl:"LOT",type:"mcq",paper:"P4",cmd:"Determine",marks:1,
   stem:"A fixed mass of ideal gas at $300\\,\\mathrm K$ and pressure $1.0\\times10^5\\,\\mathrm{Pa}$ is heated at constant volume to $450\\,\\mathrm K$. The new pressure is",
   opts:["$0.67\\times10^5\\,\\mathrm{Pa}$","$1.5\\times10^5\\,\\mathrm{Pa}$","$1.0\\times10^5\\,\\mathrm{Pa}$","$2.0\\times10^5\\,\\mathrm{Pa}$"],
   ans:1, scheme:["Constant volume: $p/T$ constant.","$p_2 = p_1\\dfrac{T_2}{T_1} = 1.0\\times10^5\\times\\dfrac{450}{300} = 1.5\\times10^5\\,\\mathrm{Pa}$."]},
  {t:"Ideal gases",lvl:"HOT",type:"structured",paper:"P4",cmd:"Explain",marks:4,
   stem:"Using kinetic theory, explain how gas molecules exert a pressure on the walls of a container, and why the pressure rises when the gas is heated at constant volume.",
   scheme:["Molecules collide with walls and rebound → change of momentum → force on wall (Newton's 2nd/3rd law).","Pressure = force per unit area from many collisions per second.","Heating raises mean kinetic energy → higher mean speed.","At constant volume: collisions more frequent and more forceful → greater pressure."]},

  // ---------- Oscillations (A2) ----------
  {t:"Oscillations",lvl:"LOT",type:"mcq",paper:"P4",cmd:"Define",marks:1,
   stem:"For a body in simple harmonic motion, the acceleration is",
   opts:["constant in magnitude and direction","proportional to displacement and in the same direction","proportional to displacement and directed toward equilibrium","zero at the extremes of motion"],
   ans:2, scheme:["Defining equation: $a = -\\omega^2 x$.","Acceleration $\\propto$ displacement, directed toward equilibrium (opposite to $x$)."]},
  {t:"Oscillations",lvl:"HOT",type:"structured",paper:"P4",cmd:"Explain",marks:4,
   stem:"A mass on a spring oscillates. (a) Explain the energy changes during one complete oscillation. (b) Explain what is meant by damping and how light damping affects the motion over time.",
   scheme:["(a) At equilibrium: max KE, min PE (elastic/gravitational).","(a) At extremes: max PE, zero KE; total energy constant (if undamped).","(b) Damping = resistive forces removing energy from the oscillator.","(b) Light damping: amplitude decays gradually (exponentially); period almost unchanged."]},

  // ---------- Electric fields (A2) ----------
  {t:"Electric fields",lvl:"LOT",type:"mcq",paper:"P4",cmd:"Calculate",marks:1,
   stem:"Two parallel plates $5.0\\,\\mathrm{mm}$ apart have a p.d. of $200\\,\\mathrm V$ across them. The field strength between them is",
   opts:["$1.0\\,\\mathrm{kV\\,m^{-1}}$","$40\\,\\mathrm{kV\\,m^{-1}}$","$4.0\\times10^4\\,\\mathrm{V\\,m^{-1}}$","both B and C"],
   ans:3, scheme:["$E = V/d = 200 / (5.0\\times10^{-3})$.","$E = 4.0\\times10^4\\,\\mathrm{V\\,m^{-1}} = 40\\,\\mathrm{kV\\,m^{-1}}$ (B and C are the same value)."]},
  {t:"Electric fields",lvl:"HOT",type:"structured",paper:"P4",cmd:"Suggest",marks:3,
   stem:"A charged oil drop is held stationary between two horizontal charged plates. Suggest and explain what happens to the drop if the p.d. across the plates is slowly reduced to zero.",
   scheme:["Stationary: electric force up balances weight: $qE = mg$.","Reducing p.d. reduces $E$ → electric force decreases below weight.","Resultant force downward → drop accelerates downward (falls)."]},

  // ---------- Capacitance (A2) ----------
  {t:"Capacitance",lvl:"LOT",type:"mcq",paper:"P4",cmd:"Calculate",marks:1,
   stem:"A $2200\\,\\mu\\mathrm F$ capacitor is charged to $12\\,\\mathrm V$. The energy stored is",
   opts:["$0.16\\,\\mathrm J$","$0.32\\,\\mathrm J$","$26\\,\\mathrm J$","$13\\,\\mathrm{mJ}$"],
   ans:0, scheme:["$W = \\tfrac12 CV^2 = \\tfrac12\\times2200\\times10^{-6}\\times12^2$.","$W \\approx 0.16\\,\\mathrm J$."]},
  {t:"Capacitance",lvl:"HOT",type:"structured",paper:"P4",cmd:"Explain",marks:4,
   stem:"A capacitor discharges through a resistor. (a) Explain why the current is largest at the start and falls to zero. (b) State what is meant by the time constant and how doubling the resistance affects the discharge.",
   scheme:["(a) Initially full p.d. across R → largest current ($I=V/R$).","(a) As charge leaves, p.d. falls → current falls; exponential decay to zero.","(b) Time constant $\\tau = RC$: time for charge to fall to $1/e$ (≈37%) of initial.","(b) Doubling R doubles $\\tau$ → discharge takes twice as long."]},

  // ---------- Magnetic fields (A2) ----------
  {t:"Magnetic fields",lvl:"LOT",type:"mcq",paper:"P4",cmd:"Calculate",marks:1,
   stem:"A wire of length $0.20\\,\\mathrm m$ carrying $3.0\\,\\mathrm A$ is at right angles to a field of flux density $0.40\\,\\mathrm T$. The force on it is",
   opts:["$0.024\\,\\mathrm N$","$0.24\\,\\mathrm N$","$2.4\\,\\mathrm N$","$1.5\\,\\mathrm N$"],
   ans:1, scheme:["$F = BIL = 0.40\\times3.0\\times0.20$.","$F = 0.24\\,\\mathrm N$."]},
  {t:"Magnetic fields",lvl:"HOT",type:"structured",paper:"P4",cmd:"Explain",marks:4,
   stem:"In a velocity selector, charged particles pass undeflected through crossed electric and magnetic fields. (a) Explain the condition for a particle to pass straight through. (b) Suggest why particles of a different speed are deflected.",
   scheme:["(a) Electric force $qE$ and magnetic force $qvB$ act in opposite directions.","(a) Undeflected when $qE = qvB \\Rightarrow v = E/B$ (independent of charge/mass).","(b) $qE$ is independent of speed; $qvB$ depends on speed.","(b) If $v \\ne E/B$ the forces are unequal → resultant force → deflection."]},

  // ---------- Alternating currents (A2) ----------
  {t:"Alternating currents",lvl:"LOT",type:"mcq",paper:"P4",cmd:"Calculate",marks:1,
   stem:"A sinusoidal a.c. supply has peak voltage $325\\,\\mathrm V$. Its r.m.s. value is approximately",
   opts:["$460\\,\\mathrm V$","$230\\,\\mathrm V$","$163\\,\\mathrm V$","$325\\,\\mathrm V$"],
   ans:1, scheme:["$V_{rms} = V_0/\\sqrt2 = 325/1.414$.","$V_{rms} \\approx 230\\,\\mathrm V$."]},
  {t:"Alternating currents",lvl:"HOT",type:"structured",paper:"P4",cmd:"Explain",marks:3,
   stem:"Explain why the r.m.s. value, rather than the peak or mean value, is used to specify an alternating current, with reference to power dissipation in a resistor.",
   scheme:["Mean of a symmetrical a.c. over a cycle is zero → not useful.","Power $\\propto I^2$, so average power depends on mean of $I^2$.","r.m.s. current = the steady d.c. that dissipates the same mean power in the resistor → meaningful measure."]},

  // ---------- Quantum physics (A2) ----------
  {t:"Quantum physics",lvl:"LOT",type:"mcq",paper:"P4",cmd:"Calculate",marks:1,
   stem:"A photon has frequency $5.0\\times10^{14}\\,\\mathrm{Hz}$. Its energy is (take $h=6.63\\times10^{-34}\\,\\mathrm{J\\,s}$)",
   opts:["$3.3\\times10^{-19}\\,\\mathrm J$","$1.3\\times10^{-48}\\,\\mathrm J$","$3.3\\times10^{-19}\\,\\mathrm{eV}$","$6.6\\times10^{-19}\\,\\mathrm J$"],
   ans:0, scheme:["$E = hf = 6.63\\times10^{-34}\\times5.0\\times10^{14}$.","$E \\approx 3.3\\times10^{-19}\\,\\mathrm J$."]},
  {t:"Quantum physics",lvl:"HOT",type:"structured",paper:"P4",cmd:"Explain",marks:4,
   stem:"The photoelectric effect cannot be explained by the wave model of light. (a) State two experimental observations that require the photon model. (b) Explain how the photon model accounts for the existence of a threshold frequency.",
   scheme:["(a) Existence of a threshold frequency below which no emission occurs, regardless of intensity.","(a) Emission is instantaneous; max KE of electrons depends on frequency not intensity.","(b) One photon delivers energy $hf$ to one electron.","(b) If $hf < \\phi$ (work function) the electron cannot escape → below threshold frequency $f_0=\\phi/h$ no emission."]},

  // ---------- Nuclear physics (A2) ----------
  {t:"Nuclear physics",lvl:"LOT",type:"mcq",paper:"P4",cmd:"Calculate",marks:1,
   stem:"A radioactive sample has a half-life of $8.0\\,\\mathrm{days}$. After $24\\,\\mathrm{days}$, the fraction of the original nuclei remaining is",
   opts:["$1/2$","$1/4$","$1/8$","$1/16$"],
   ans:2, scheme:["24 days = 3 half-lives.","Fraction $=(1/2)^3 = 1/8$."]},
  {t:"Nuclear physics",lvl:"HOT",type:"structured",paper:"P4",cmd:"Show that",marks:4,
   stem:"The binding energy per nucleon curve peaks near iron. (a) Explain what binding energy is. (b) Show, using the curve's shape, why both nuclear fusion of light nuclei and fission of heavy nuclei can release energy.",
   scheme:["(a) Binding energy = energy needed to separate a nucleus into its constituent nucleons (equiv. energy released on formation); linked to mass defect via $E=mc^2$.","(b) Products with higher binding energy per nucleon are more stable → energy released.","(b) Fusion of light nuclei moves up the steep left side → increase in BE/nucleon → energy released.","(b) Fission of heavy nuclei moves toward the peak → increase in BE/nucleon → energy released."]},

  // ---------- Astronomy & cosmology (A2) ----------
  {t:"Astronomy & cosmology",lvl:"LOT",type:"mcq",paper:"P4",cmd:"State",marks:1,
   stem:"Hubble's law states that the recession speed of a distant galaxy is",
   opts:["independent of its distance","inversely proportional to its distance","directly proportional to its distance","proportional to the square of its distance"],
   ans:2, scheme:["$v = H_0 d$: recession speed $\\propto$ distance.","Evidence for an expanding universe / Big Bang."]},
  {t:"Astronomy & cosmology",lvl:"HOT",type:"structured",paper:"P4",cmd:"Explain",marks:3,
   stem:"Light from distant galaxies shows redshift. Explain what redshift is and how it provides evidence that the universe is expanding.",
   scheme:["Redshift: observed wavelength longer than emitted → spectral lines shifted toward red.","Interpreted as galaxies receding → Doppler-like shift, $\\Delta\\lambda/\\lambda \\approx v/c$.","More distant galaxies show greater redshift (Hubble's law) → space itself expanding."]}
];

import { OL_RAW } from "./bank-olevel";

const SEED_RAW: Omit<ELQuestion, "id">[] = [...RAW, ...OL_RAW];

export const BANK: ELQuestion[] = SEED_RAW.map((q, i) => ({
  id: `seed-${String(i + 1).padStart(3, "0")}`,
  visibility: "both" as const,
  source: "authored",
  ...q,
}));

// 9702 canonical topics (unchanged for existing AS/A2 flows).
export const ALL_TOPICS: string[] = [...TOPICS.AS, ...TOPICS.A2];
// Full topic set including O Level 5054.
export const ALL_TOPICS_WITH_OL: string[] = [...TOPICS.AS, ...TOPICS.A2, ...TOPICS.OL];

/** Bank items for a given awarding-body course (legacy entries ⇒ 9702). */
export function bankForCourse(course: "9702" | "5054" | "IB"): ELQuestion[] {
  return BANK.filter((q) => (q.course ?? "9702") === course);
}
