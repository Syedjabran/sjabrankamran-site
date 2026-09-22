#!/usr/bin/env python3
"""
Cambridge O Level 5054 topic + thinking-level classification.

The syllabus sections (General Physics, Thermal Physics, Properties of Waves
including Light and Sound, Electricity and Magnetism, Atomic Physics, Space
Physics) are expressed here at the sub-topic granularity the public site already
uses on /physics/o-level-5054 (src/app/physics/qualifications.ts), so a drill
chip in the Exam Lab and a topic on the qualification page read identically.

`propose()` is a keyword scorer that gives a STARTING POINT for a new session.
It is deliberately NOT the source of truth: every question shipped in the bank
carries a topic and level from reviewed.json, which was checked against the
question text of the actual paper. `extract5054.py --review` prints the
classifier's proposal next to the reviewed value so disagreements are visible
when a new session is added.
"""
import re

# Topic vocabulary — kept in lockstep with the `o-level-5054` entry of
# src/app/physics/qualifications.ts.
TOPICS = [
    "Measurement & units",
    "Kinematics & dynamics",
    "Mass, weight & density",
    "Forces, moments & pressure",
    "Work, energy & power",
    "Thermal physics",
    "Waves, light & sound",
    "Electricity & magnetism",
    "Electromagnetic effects",
    "Atomic physics",
    "Space physics",
    # Paper 4 (Alternative to Practical) assesses experimental technique across
    # the whole syllabus; a single content topic would misrepresent it.
    "Practical skills",
]

TOPIC_KW = [
    ("Measurement & units", [("si unit", 3), ("vector", 3), ("scalar", 3), ("measuring cylinder", 2),
                             ("micrometer", 2), ("micrometer screw gauge", 3), ("metre rule", 2),
                             ("significant figure", 2), ("stopwatch", 2), ("stop-watch", 2),
                             ("precision", 2), ("accuracy", 2), ("prefix", 2), ("nearest 0.1", 2),
                             ("vernier", 3), ("zero error", 3), ("parallax", 3), ("base quantity", 3),
                             ("base unit", 2), ("derived unit", 3), ("reading error", 2),
                             ("order of magnitude", 3)]),
    ("Kinematics & dynamics", [("distance-time", 3), ("distance−time", 3), ("speed-time", 3),
                               ("speed−time", 3), ("acceleration", 2), ("deceler", 2),
                               ("velocity", 2), ("free fall", 3), ("terminal velocity", 3),
                               ("thinking distance", 3), ("braking distance", 3), ("friction", 1),
                               ("resultant force", 2), ("newton's", 2), ("inertia", 3),
                               ("constant speed", 2), ("momentum", 3), ("reaction time", 3),
                               ("stopping distance", 3), ("ticker", 3), ("ticker-tape", 3),
                               ("light gate", 3), ("uniform acceleration", 2), ("displacement", 2),
                               ("average speed", 2), ("conservation of momentum", 3)]),
    ("Mass, weight & density", [("density", 3), ("kg / m3", 2), ("kg/m3", 2), ("mass and", 1),
                                ("weight of", 1), ("float", 3), ("sink", 2), ("upthrust", 3),
                                ("displaces", 2), ("displaced water", 3), ("relative density", 3),
                                ("gravitational field strength", 3), ("eureka can", 3)]),
    ("Forces, moments & pressure", [("moment", 3), ("turning effect", 3), ("pivot", 3),
                                    ("centre of gravity", 3), ("stable", 2), ("stability", 3),
                                    ("spring", 3), ("hooke", 3), ("limit of proportionality", 3),
                                    ("extension", 2), ("pressure", 3), ("atmospheric pressure", 3),
                                    ("pascal", 2), ("piston", 2), ("manometer", 3), ("barometer", 3),
                                    ("hydraulic", 3), ("principle of moments", 3),
                                    ("liquid pressure", 3), ("depth of liquid", 3), ("see-saw", 2),
                                    ("spring constant", 3)]),
    ("Work, energy & power", [("work done", 3), ("kinetic energy", 3), ("potential energy", 3),
                              ("efficiency", 3), ("renewable", 3), ("energy source", 3),
                              ("turbine", 3), ("kw h", 3), ("kilowatt", 3), ("power station", 3),
                              ("energy store", 2), ("joule", 2), ("power", 1),
                              ("conservation of energy", 3), ("energy transfer", 2),
                              ("fossil fuel", 3), ("solar cell", 3), ("solar panel", 3),
                              ("hydroelectric", 3), ("geothermal", 3), ("non-renewable", 3),
                              ("useful energy", 2), ("wasted energy", 2)]),
    ("Thermal physics", [("thermal conduction", 3), ("convection", 3), ("thermal energy", 2),
                         ("specific heat", 3), ("latent heat", 3), ("boiling", 3), ("melting", 3),
                         ("evaporation", 3), ("thermometer", 3), ("particles", 2), ("infrared", 2),
                         ("temperature", 2), ("kelvin", 2), ("expands", 2), ("compressed", 2),
                         ("gas", 1), ("thermal capacity", 3), ("kinetic theory", 3),
                         ("kinetic particle model", 3), ("gas pressure", 3), ("gas laws", 3),
                         ("pressure law", 3), ("bimetallic strip", 3), ("absolute zero", 3),
                         ("boiling point", 2), ("melting point", 2), ("condensation", 3),
                         ("sublimation", 3), ("specific latent heat", 3), ("thermal expansion", 3),
                         ("heat conductor", 3), ("conductor of heat", 3), ("poor conductor", 2)]),
    ("Waves, light & sound", [("wavelength", 3), ("frequency", 3), ("amplitude", 3),
                              ("refractive index", 3), ("refraction", 3), ("reflection", 2),
                              ("lens", 3), ("mirror", 3), ("spectrum", 3), ("ultrasound", 3),
                              ("sound", 2), ("echo", 3), ("prism", 3), ("ray of light", 3),
                              ("microwave", 2), ("total internal reflection", 3),
                              ("transverse", 3), ("longitudinal", 3), ("focal length", 3),
                              ("converging lens", 3), ("diverging lens", 3), ("real image", 3),
                              ("virtual image", 3), ("angle of incidence", 3), ("critical angle", 3),
                              ("diffraction", 3), ("interference", 3),
                              ("electromagnetic spectrum", 3), ("x-ray", 2), ("ultraviolet", 2),
                              ("loudness", 2), ("pitch", 2), ("vibrat", 2), ("pinhole camera", 3)]),
    ("Electricity & magnetism", [("circuit", 2), ("resistance", 3), ("resistor", 3),
                                 ("potential difference", 3), ("ammeter", 3), ("voltmeter", 3),
                                 ("fuse", 3), ("light-dependent resistor", 3), ("ldr", 3),
                                 ("thermistor", 3), ("in series", 2), ("in parallel", 2),
                                 ("electrons", 1), ("charge", 2), ("bar magnet", 3),
                                 ("compass", 3), ("induced magnet", 3), ("magnetic pole", 3),
                                 ("current", 1), ("mains", 2), ("rheostat", 3), ("variable resistor", 3),
                                 ("e.m.f.", 2), ("electromotive force", 3), ("diode", 3),
                                 ("switch", 1), ("battery", 2), ("insulator", 2), ("electrostatic", 3),
                                 ("static charge", 3), ("earth wire", 3), ("live wire", 3),
                                 ("neutral wire", 3), ("short circuit", 3), ("iron filings", 3),
                                 ("permanent magnet", 3), ("soft iron", 3), ("hard steel", 3)]),
    ("Electromagnetic effects", [("transformer", 3), ("commutator", 3), ("slip ring", 3),
                                 ("electric motor", 3), ("generator", 3), ("solenoid", 3),
                                 ("electromagnet", 3), ("loudspeaker", 3),
                                 ("electromagnetic induction", 3), ("induced e.m.f", 3),
                                 ("coil", 2), ("primary coil", 3), ("secondary coil", 3),
                                 ("right-hand rule", 3), ("left-hand rule", 3), ("fleming", 3),
                                 ("magnetic flux", 3), ("step-up", 3), ("step-down", 3),
                                 ("turns ratio", 3), ("number of turns", 2), ("relay", 3),
                                 ("dynamo", 3), ("alternator", 3), ("moving-coil", 3)]),
    ("Atomic physics", [("nucleus", 3), ("nuclei", 3), ("proton", 3), ("neutron", 3),
                        ("isotope", 3), ("alpha particle", 3), ("beta", 2), ("gamma", 3),
                        ("half-life", 3), ("radioactive", 3), ("fission", 3), ("fusion", 3),
                        ("decay", 2), ("background radiation", 3), ("gold foil", 3),
                        ("nuclear reactor", 3), ("count rate", 3), ("atomic number", 3),
                        ("mass number", 3), ("proton number", 3), ("nucleon number", 3),
                        ("geiger", 3), ("ionising", 3), ("ionisation", 2), ("penetrating power", 3),
                        ("chain reaction", 3), ("control rod", 3), ("moderator", 3),
                        ("radioactive source", 2), ("irradiat", 2)]),
    ("Space physics", [("planet", 3), ("orbit", 3), ("galax", 3), ("redshift", 3),
                       ("solar system", 3), ("life cycle", 2), ("the sun", 2), ("moon", 3),
                       ("light-year", 3), ("light year", 3), ("universe", 3), ("big bang", 3),
                       ("star", 2), ("nebula", 3), ("satellite", 3), ("artificial satellite", 3),
                       ("geostationary", 3), ("red giant", 3), ("white dwarf", 3), ("supernova", 3),
                       ("protostar", 3), ("main sequence", 3), ("comet", 3), ("parsec", 3),
                       ("gravitational force", 2), ("natural satellite", 3)]),
]

# Phrases that mark a question as requiring multi-step reasoning or calculation
# rather than recall/identification.
HOT_RE = re.compile(
    r"\b(calculate|determine|explain|suggest|show that|justify|compare|deduce|discuss|"
    r"estimate|describe the process|plan an experiment|why)\b", re.I)
NOT_RE = re.compile(r"\bis not\b|\bnot a conclusion\b", re.I)
LOT_RE = re.compile(
    r"^(which quantity|which statement|which unit|which diagram|which row|which component|"
    r"state |name |give the name|what is meant by|define )", re.I)


def propose_topic(text, paper_type):
    """Best-guess topic for a question's extracted text. None when unsure."""
    if paper_type == "P4":
        return "Practical skills"
    t = text.lower()
    best, score = None, 0
    for topic, kws in TOPIC_KW:
        s = sum(w for k, w in kws if k in t)
        if s > score:
            best, score = topic, s
    return best if score >= 3 else None


def propose_level(text):
    t = " ".join(text.split())
    if NOT_RE.search(t):
        return "HOT"
    if HOT_RE.search(t):
        return "HOT"
    if LOT_RE.search(t.strip()):
        return "LOT"
    # A multiple-choice question whose four options are all numeric is a
    # calculation, not a recall item.
    if re.search(r"\bA\s+[-\d]", t) and len(re.findall(r"\b[ABCD]\s+[-\d]", t)) >= 4:
        return "HOT"
    return "LOT"
