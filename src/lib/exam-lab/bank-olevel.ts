// Cambridge O Level Physics (5054) — original, syllabus-structure-aligned practice
// questions authored by the site owner for the Exam Lab. Mirrors the 9702 seed
// bank format (see bank.ts). O-Level difficulty (P1 multiple choice + P2 theory).
// No past-paper reproduction; no outcome/affiliation claims. Cambridge names are
// used only to identify the qualification; this site is independent of Cambridge.

import type { ELQuestion } from "./bank";

// Every entry is tagged course:"5054" and uses the distinct O-Level topic tags
// (bank TOPICS.OL) so topic-based drawing keeps O-Level drills fully separate
// from 9702 generation.
export const OL_RAW: Omit<ELQuestion, "id">[] = [
  // ---------- Measurements & units ----------
  {t:"Measurements & units",lvl:"LOT",type:"mcq",paper:"P1",cmd:"State",marks:1,course:"5054",visibility:"both",
   stem:"Which of the following is a set of only SI base quantities?",
   opts:["Length, mass, weight","Length, mass, time","Mass, force, time","Mass, speed, length"],
   ans:1, scheme:["SI base quantities include length (m), mass (kg) and time (s).","Weight, force and speed are derived quantities."]},
  {t:"Measurements & units",lvl:"HOT",type:"structured",paper:"P2",cmd:"Calculate",marks:3,course:"5054",visibility:"both",
   stem:"A student measures a block of length $15.0\\,\\mathrm{cm}$ using a rule with $1\\,\\mathrm{mm}$ divisions. (a) State the smallest division of the rule in cm. (b) Calculate the percentage uncertainty in the measured length.",
   scheme:["(a) Smallest division $=0.1\\,\\mathrm{cm}$ ($1\\,\\mathrm{mm}$).","(b) $\\%\\text{ uncertainty}=\\dfrac{0.1}{15.0}\\times100$.","(b) $=0.67\\%$."]},

  // ---------- Kinematics ----------
  {t:"Kinematics",lvl:"LOT",type:"mcq",paper:"P1",cmd:"Calculate",marks:1,course:"5054",visibility:"both",
   stem:"A car accelerates uniformly from $5\\,\\mathrm{m\\,s^{-1}}$ to $25\\,\\mathrm{m\\,s^{-1}}$ in $10\\,\\mathrm{s}$. Its acceleration is",
   opts:["$2.0\\,\\mathrm{m\\,s^{-2}}$","$3.0\\,\\mathrm{m\\,s^{-2}}$","$5.0\\,\\mathrm{m\\,s^{-2}}$","$20\\,\\mathrm{m\\,s^{-2}}$"],
   ans:0, scheme:["$a=\\dfrac{v-u}{t}=\\dfrac{25-5}{10}$.","$a=2.0\\,\\mathrm{m\\,s^{-2}}$."]},
  {t:"Kinematics",lvl:"HOT",type:"structured",paper:"P2",cmd:"Explain",marks:4,course:"5054",visibility:"both",
   stem:"A skydiver jumps from a stationary balloon. Describe and explain the motion of the skydiver from the moment of jumping until terminal velocity is reached.",
   scheme:["At first the only significant force is weight, so acceleration is (approximately) $g$.","As speed increases, air resistance increases.","Resultant (downward) force decreases, so acceleration decreases.","When air resistance equals weight, resultant force is zero → constant (terminal) velocity."]},

  // ---------- Dynamics & forces ----------
  {t:"Dynamics & forces",lvl:"LOT",type:"mcq",paper:"P1",cmd:"Calculate",marks:1,course:"5054",visibility:"both",
   stem:"A resultant force of $12\\,\\mathrm{N}$ acts on a mass of $4.0\\,\\mathrm{kg}$. The acceleration produced is",
   opts:["$0.33\\,\\mathrm{m\\,s^{-2}}$","$3.0\\,\\mathrm{m\\,s^{-2}}$","$8.0\\,\\mathrm{m\\,s^{-2}}$","$48\\,\\mathrm{m\\,s^{-2}}$"],
   ans:1, scheme:["$a=\\dfrac{F}{m}=\\dfrac{12}{4.0}$.","$a=3.0\\,\\mathrm{m\\,s^{-2}}$."]},
  {t:"Dynamics & forces",lvl:"HOT",type:"structured",paper:"P2",cmd:"Define",marks:3,course:"5054",visibility:"both",
   stem:"(a) Define the newton. (b) A trolley of mass $2.0\\,\\mathrm{kg}$ experiences a resultant force of $5.0\\,\\mathrm{N}$. Calculate its acceleration.",
   scheme:["(a) One newton is the force that gives a mass of $1\\,\\mathrm{kg}$ an acceleration of $1\\,\\mathrm{m\\,s^{-2}}$.","(b) $a=F/m=5.0/2.0$.","(b) $a=2.5\\,\\mathrm{m\\,s^{-2}}$."]},

  // ---------- Mass, weight & density ----------
  {t:"Mass, weight & density",lvl:"LOT",type:"mcq",paper:"P1",cmd:"Calculate",marks:1,course:"5054",visibility:"both",
   stem:"An object has a mass of $240\\,\\mathrm{g}$ and a volume of $30\\,\\mathrm{cm^3}$. Its density is",
   opts:["$0.125\\,\\mathrm{g\\,cm^{-3}}$","$8.0\\,\\mathrm{g\\,cm^{-3}}$","$210\\,\\mathrm{g\\,cm^{-3}}$","$7200\\,\\mathrm{g\\,cm^{-3}}$"],
   ans:1, scheme:["$\\rho=\\dfrac{m}{V}=\\dfrac{240}{30}$.","$\\rho=8.0\\,\\mathrm{g\\,cm^{-3}}$."]},
  {t:"Mass, weight & density",lvl:"HOT",type:"structured",paper:"P2",cmd:"Describe",marks:4,course:"5054",visibility:"both",
   stem:"Describe how you would determine the density of a small irregular stone using a balance and a measuring cylinder with water.",
   scheme:["Measure the mass $m$ of the stone on the balance.","Part-fill the measuring cylinder with water and record the volume $V_1$.","Lower the stone in; record the new volume $V_2$. Volume of stone $=V_2-V_1$.","Density $\\rho=\\dfrac{m}{V_2-V_1}$."]},

  // ---------- Turning effects & pressure ----------
  {t:"Turning effects & pressure",lvl:"LOT",type:"mcq",paper:"P1",cmd:"Calculate",marks:1,course:"5054",visibility:"both",
   stem:"A force of $15\\,\\mathrm{N}$ acts at a perpendicular distance of $0.20\\,\\mathrm{m}$ from a pivot. The moment of the force is",
   opts:["$0.013\\,\\mathrm{N\\,m}$","$3.0\\,\\mathrm{N\\,m}$","$7.5\\,\\mathrm{N\\,m}$","$75\\,\\mathrm{N\\,m}$"],
   ans:1, scheme:["Moment $=F\\times d=15\\times0.20$.","$=3.0\\,\\mathrm{N\\,m}$."]},
  {t:"Turning effects & pressure",lvl:"HOT",type:"structured",paper:"P2",cmd:"Calculate",marks:3,course:"5054",visibility:"both",
   stem:"A diver is $2.0\\,\\mathrm{m}$ below the surface of water of density $1000\\,\\mathrm{kg\\,m^{-3}}$. Taking $g=10\\,\\mathrm{N\\,kg^{-1}}$, (a) state the equation for pressure due to a liquid column and (b) calculate the pressure due to the water at this depth.",
   scheme:["(a) $p=h\\rho g$.","(b) $p=2.0\\times1000\\times10$.","(b) $p=20000\\,\\mathrm{Pa}\\;(20\\,\\mathrm{kPa})$."]},

  // ---------- Energy, work & power ----------
  {t:"Energy, work & power",lvl:"LOT",type:"mcq",paper:"P1",cmd:"Calculate",marks:1,course:"5054",visibility:"both",
   stem:"A force of $50\\,\\mathrm{N}$ moves an object $4.0\\,\\mathrm{m}$ in the direction of the force. The work done is",
   opts:["$12.5\\,\\mathrm{J}$","$54\\,\\mathrm{J}$","$200\\,\\mathrm{J}$","$800\\,\\mathrm{J}$"],
   ans:2, scheme:["$W=F\\times d=50\\times4.0$.","$W=200\\,\\mathrm{J}$."]},
  {t:"Energy, work & power",lvl:"HOT",type:"structured",paper:"P2",cmd:"Calculate",marks:3,course:"5054",visibility:"both",
   stem:"An electric motor does $6000\\,\\mathrm{J}$ of useful work in $30\\,\\mathrm{s}$. (a) Define power. (b) Calculate the useful output power of the motor.",
   scheme:["(a) Power is the work done (energy transferred) per unit time.","(b) $P=\\dfrac{W}{t}=\\dfrac{6000}{30}$.","(b) $P=200\\,\\mathrm{W}$."]},

  // ---------- Momentum ----------
  {t:"Momentum",lvl:"LOT",type:"mcq",paper:"P1",cmd:"Calculate",marks:1,course:"5054",visibility:"both",
   stem:"A body of mass $2.0\\,\\mathrm{kg}$ moves at $3.0\\,\\mathrm{m\\,s^{-1}}$. Its momentum is",
   opts:["$0.67\\,\\mathrm{kg\\,m\\,s^{-1}}$","$1.5\\,\\mathrm{kg\\,m\\,s^{-1}}$","$5.0\\,\\mathrm{kg\\,m\\,s^{-1}}$","$6.0\\,\\mathrm{kg\\,m\\,s^{-1}}$"],
   ans:3, scheme:["$p=mv=2.0\\times3.0$.","$p=6.0\\,\\mathrm{kg\\,m\\,s^{-1}}$."]},
  {t:"Momentum",lvl:"HOT",type:"structured",paper:"P2",cmd:"Calculate",marks:4,course:"5054",visibility:"both",
   stem:"A trolley of mass $2.0\\,\\mathrm{kg}$ moving at $3.0\\,\\mathrm{m\\,s^{-1}}$ collides with a stationary trolley of mass $1.0\\,\\mathrm{kg}$ and they move off together. (a) State the principle of conservation of momentum. (b) Calculate their common velocity after the collision.",
   scheme:["(a) In the absence of external forces, the total momentum of a system is constant.","(b) Total momentum before $=2.0\\times3.0=6.0\\,\\mathrm{kg\\,m\\,s^{-1}}$.","(b) After: $(2.0+1.0)\\,v=6.0$.","(b) $v=2.0\\,\\mathrm{m\\,s^{-1}}$."]},

  // ---------- Kinetic model & thermal properties ----------
  {t:"Kinetic model & thermal properties",lvl:"LOT",type:"mcq",paper:"P1",cmd:"State",marks:1,course:"5054",visibility:"both",
   stem:"In which state of matter are the particles held in fixed positions, vibrating about a mean point?",
   opts:["Solid","Liquid","Gas","Plasma"],
   ans:0, scheme:["In a solid, particles are closely packed in fixed positions and vibrate.","Liquids and gases have particles free to move."]},
  {t:"Kinetic model & thermal properties",lvl:"HOT",type:"structured",paper:"P2",cmd:"Calculate",marks:3,course:"5054",visibility:"both",
   stem:"A mass of $0.50\\,\\mathrm{kg}$ of water is heated so that its temperature rises by $20\\,^{\\circ}\\mathrm{C}$. The specific heat capacity of water is $4200\\,\\mathrm{J\\,kg^{-1}\\,^{\\circ}C^{-1}}$. (a) State the equation linking thermal energy, mass, specific heat capacity and temperature change. (b) Calculate the thermal energy supplied.",
   scheme:["(a) $E=mc\\,\\Delta\\theta$.","(b) $E=0.50\\times4200\\times20$.","(b) $E=42000\\,\\mathrm{J}\\;(42\\,\\mathrm{kJ})$."]},

  // ---------- Transfer of thermal energy ----------
  {t:"Transfer of thermal energy",lvl:"LOT",type:"mcq",paper:"P1",cmd:"State",marks:1,course:"5054",visibility:"both",
   stem:"By which process can thermal energy travel through a vacuum?",
   opts:["Conduction","Convection","Radiation","Evaporation"],
   ans:2, scheme:["Radiation (infra-red) requires no medium and travels through a vacuum.","Conduction and convection both require a material medium."]},
  {t:"Transfer of thermal energy",lvl:"HOT",type:"structured",paper:"P2",cmd:"Explain",marks:3,course:"5054",visibility:"both",
   stem:"Explain, in terms of density, how a convection current is set up when water in a beaker is heated from below.",
   scheme:["Water near the heat source is warmed and expands, so its density decreases.","The less dense warm water rises; cooler, denser water sinks to take its place.","This circulation forms a convection current that transfers thermal energy through the water."]},

  // ---------- General wave properties ----------
  {t:"General wave properties",lvl:"LOT",type:"mcq",paper:"P1",cmd:"Calculate",marks:1,course:"5054",visibility:"both",
   stem:"A wave has frequency $50\\,\\mathrm{Hz}$ and wavelength $2.0\\,\\mathrm{m}$. Its speed is",
   opts:["$25\\,\\mathrm{m\\,s^{-1}}$","$52\\,\\mathrm{m\\,s^{-1}}$","$100\\,\\mathrm{m\\,s^{-1}}$","$0.040\\,\\mathrm{m\\,s^{-1}}$"],
   ans:2, scheme:["$v=f\\lambda=50\\times2.0$.","$v=100\\,\\mathrm{m\\,s^{-1}}$."]},
  {t:"General wave properties",lvl:"HOT",type:"structured",paper:"P2",cmd:"Define",marks:3,course:"5054",visibility:"both",
   stem:"For a transverse wave, (a) define wavelength and (b) define frequency. (c) A wave of speed $340\\,\\mathrm{m\\,s^{-1}}$ has a wavelength of $0.68\\,\\mathrm{m}$; calculate its frequency.",
   scheme:["(a) Wavelength: the distance between two consecutive points in phase (e.g. crest to crest).","(b) Frequency: the number of complete waves passing a point per second.","(c) $f=v/\\lambda=340/0.68=500\\,\\mathrm{Hz}$."]},

  // ---------- Light & optics ----------
  {t:"Light & optics",lvl:"LOT",type:"mcq",paper:"P1",cmd:"State",marks:1,course:"5054",visibility:"both",
   stem:"A ray of light strikes a plane mirror at an angle of incidence of $30^{\\circ}$ to the normal. The angle of reflection is",
   opts:["$0^{\\circ}$","$30^{\\circ}$","$60^{\\circ}$","$90^{\\circ}$"],
   ans:1, scheme:["Law of reflection: angle of reflection $=$ angle of incidence.","Both are measured from the normal, so the angle of reflection is $30^{\\circ}$."]},
  {t:"Light & optics",lvl:"HOT",type:"structured",paper:"P2",cmd:"Describe",marks:3,course:"5054",visibility:"both",
   stem:"State the two conditions necessary for total internal reflection to occur, and give one practical use of total internal reflection.",
   scheme:["The light must be travelling in the denser (optically more dense) medium towards the less dense medium.","The angle of incidence must be greater than the critical angle.","Use: optical fibres (or a periscope/reflecting prism)."]},

  // ---------- Electromagnetic spectrum & sound ----------
  {t:"Electromagnetic spectrum & sound",lvl:"LOT",type:"mcq",paper:"P1",cmd:"State",marks:1,course:"5054",visibility:"both",
   stem:"Which of the following has the longest wavelength in the electromagnetic spectrum?",
   opts:["Radio waves","Visible light","X-rays","Gamma rays"],
   ans:0, scheme:["Radio waves have the longest wavelength (lowest frequency) of the options.","Gamma rays have the shortest wavelength."]},
  {t:"Electromagnetic spectrum & sound",lvl:"HOT",type:"structured",paper:"P2",cmd:"Calculate",marks:3,course:"5054",visibility:"both",
   stem:"A person stands in front of a large wall and claps. The echo is heard $0.50\\,\\mathrm{s}$ later. The speed of sound in air is $340\\,\\mathrm{m\\,s^{-1}}$. (a) Explain why an echo is heard. (b) Calculate the distance from the person to the wall.",
   scheme:["(a) Sound is reflected from the wall back to the listener.","(b) Total distance $=340\\times0.50=170\\,\\mathrm{m}$.","(b) Distance to wall $=170/2=85\\,\\mathrm{m}$."]},

  // ---------- Magnetism ----------
  {t:"Magnetism",lvl:"LOT",type:"mcq",paper:"P1",cmd:"State",marks:1,course:"5054",visibility:"both",
   stem:"When the north pole of one magnet is brought near the north pole of another, the magnets",
   opts:["attract each other","repel each other","exert no force","become demagnetised"],
   ans:1, scheme:["Like poles repel.","Unlike poles attract."]},
  {t:"Magnetism",lvl:"HOT",type:"structured",paper:"P2",cmd:"Describe",marks:3,course:"5054",visibility:"both",
   stem:"Describe how you would use a plotting compass to trace the magnetic field pattern around a bar magnet, and state the direction in which the field lines point.",
   scheme:["Place the compass near the magnet and mark the direction the needle points with dots.","Move the compass so its tail is at the previous dot; repeat to build a line, then join the dots.","Field lines are directed from the north pole to the south pole (outside the magnet)."]},

  // ---------- Electrical quantities & circuits ----------
  {t:"Electrical quantities & circuits",lvl:"LOT",type:"mcq",paper:"P1",cmd:"Calculate",marks:1,course:"5054",visibility:"both",
   stem:"A potential difference of $12\\,\\mathrm{V}$ is applied across a resistor of resistance $4.0\\,\\Omega$. The current is",
   opts:["$0.33\\,\\mathrm{A}$","$3.0\\,\\mathrm{A}$","$8.0\\,\\mathrm{A}$","$48\\,\\mathrm{A}$"],
   ans:1, scheme:["$I=\\dfrac{V}{R}=\\dfrac{12}{4.0}$.","$I=3.0\\,\\mathrm{A}$."]},
  {t:"Electrical quantities & circuits",lvl:"HOT",type:"structured",paper:"P2",cmd:"Calculate",marks:3,course:"5054",visibility:"both",
   stem:"Two resistors, each of resistance $6.0\\,\\Omega$, are connected in parallel. (a) Calculate their combined resistance. (b) A steady current of $2.0\\,\\mathrm{A}$ then flows from the supply for $10\\,\\mathrm{s}$; calculate the charge that flows.",
   scheme:["(a) $\\dfrac{1}{R}=\\dfrac{1}{6.0}+\\dfrac{1}{6.0}\\Rightarrow R=3.0\\,\\Omega$.","(b) $Q=It=2.0\\times10$.","(b) $Q=20\\,\\mathrm{C}$."]},

  // ---------- Practical electricity & safety ----------
  {t:"Practical electricity & safety",lvl:"LOT",type:"mcq",paper:"P1",cmd:"Calculate",marks:1,course:"5054",visibility:"both",
   stem:"An electric heater is rated $230\\,\\mathrm{V}$, $920\\,\\mathrm{W}$. The normal operating current is",
   opts:["$0.25\\,\\mathrm{A}$","$4.0\\,\\mathrm{A}$","$250\\,\\mathrm{A}$","$2.1\\times10^{5}\\,\\mathrm{A}$"],
   ans:1, scheme:["$P=VI\\Rightarrow I=\\dfrac{P}{V}=\\dfrac{920}{230}$.","$I=4.0\\,\\mathrm{A}$."]},
  {t:"Practical electricity & safety",lvl:"HOT",type:"structured",paper:"P2",cmd:"Explain",marks:4,course:"5054",visibility:"both",
   stem:"Explain the function of (a) the fuse and (b) the earth wire in a mains appliance with a metal case.",
   scheme:["(a) The fuse contains a thin wire that melts (blows) if the current exceeds its rating.","(a) This breaks the circuit and prevents overheating / fire.","(b) The earth wire connects the metal case to earth.","(b) A fault making the case live drives a large current to earth, blowing the fuse and preventing electric shock."]},

  // ---------- Electromagnetic effects ----------
  {t:"Electromagnetic effects",lvl:"LOT",type:"mcq",paper:"P1",cmd:"State",marks:1,course:"5054",visibility:"both",
   stem:"A magnet is moved into a coil connected to a sensitive voltmeter. The induced e.m.f. can be increased by",
   opts:["moving the magnet more slowly","using fewer turns on the coil","moving the magnet faster","holding the magnet still inside the coil"],
   ans:2, scheme:["A faster rate of change of magnetic flux induces a larger e.m.f.","More turns and a stronger magnet also increase the induced e.m.f."]},
  {t:"Electromagnetic effects",lvl:"HOT",type:"structured",paper:"P2",cmd:"Calculate",marks:3,course:"5054",visibility:"both",
   stem:"A transformer has $1000$ turns on the primary coil and $100$ turns on the secondary coil. The primary is connected to a $230\\,\\mathrm{V}$ a.c. supply. (a) State whether this is a step-up or step-down transformer. (b) Calculate the secondary voltage.",
   scheme:["(a) Step-down (fewer secondary turns than primary).","(b) $\\dfrac{V_s}{V_p}=\\dfrac{N_s}{N_p}\\Rightarrow V_s=230\\times\\dfrac{100}{1000}$.","(b) $V_s=23\\,\\mathrm{V}$."]},

  // ---------- Radioactivity & the nuclear atom ----------
  {t:"Radioactivity & the nuclear atom",lvl:"LOT",type:"mcq",paper:"P1",cmd:"State",marks:1,course:"5054",visibility:"both",
   stem:"Which type of nuclear radiation is the most penetrating?",
   opts:["Alpha","Beta","Gamma","All are equally penetrating"],
   ans:2, scheme:["Gamma radiation is the most penetrating (stopped only by thick lead/concrete).","Alpha is the least penetrating (stopped by paper)."]},
  {t:"Radioactivity & the nuclear atom",lvl:"HOT",type:"structured",paper:"P2",cmd:"Calculate",marks:3,course:"5054",visibility:"both",
   stem:"A radioactive source has a half-life of $6\\,\\mathrm{hours}$. (a) Define the term half-life. (b) A sample initially has an activity of $80\\,\\mathrm{Bq}$; calculate its activity after $18\\,\\mathrm{hours}$.",
   scheme:["(a) Half-life is the time taken for half the radioactive nuclei present to decay (or for the activity to halve).","(b) $18\\,\\mathrm{h}=3$ half-lives, so activity $=80\\times(1/2)^3$.","(b) $=80/8=10\\,\\mathrm{Bq}$."]},
];
