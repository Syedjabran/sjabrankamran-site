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
                             ("micrometer", 2), ("metre rule", 2), ("significant figure", 2),
                             ("stopwatch", 2), ("stop-watch", 2), ("precision", 2), ("accuracy", 2),
                             ("prefix", 2), ("nearest 0.1", 2)]),
    ("Kinematics & dynamics", [("distance-time", 3), ("distance−time", 3), ("speed-time", 3),
                               ("speed−time", 3), ("acceleration", 2), ("deceler", 2),
                               ("velocity", 2), ("free fall", 3), ("terminal velocity", 3),
                               ("thinking distance", 3), ("braking distance", 3), ("friction", 1),
                               ("resultant force", 2), ("newton's", 2), ("inertia", 3),
                               ("constant speed", 2), ("momentum", 3)]),
    ("Mass, weight & density", [("density", 3), ("kg / m3", 2), ("mass and", 1), ("weight of", 1)]),
    ("Forces, moments & pressure", [("moment", 3), ("turning effect", 3), ("pivot", 3),
                                    ("centre of gravity", 3), ("stable", 2), ("stability", 3),
                                    ("spring", 3), ("hooke", 3), ("limit of proportionality", 3),
                                    ("extension", 2), ("pressure", 3), ("atmospheric pressure", 3),
                                    ("pascal", 2), ("piston", 2)]),
    ("Work, energy & power", [("work done", 3), ("kinetic energy", 3), ("potential energy", 3),
                              ("efficiency", 3), ("renewable", 3), ("energy source", 3),
                              ("turbine", 3), ("kw h", 3), ("kilowatt", 3), ("power station", 3),
                              ("energy store", 2), ("joule", 2), ("power", 1)]),
    ("Thermal physics", [("thermal conduction", 3), ("convection", 3), ("thermal energy", 2),
                         ("specific heat", 3), ("latent heat", 3), ("boiling", 3), ("melting", 3),
                         ("evaporation", 3), ("thermometer", 3), ("particles", 2), ("infrared", 2),
                         ("temperature", 2), ("kelvin", 2), ("expands", 2), ("compressed", 2),
                         ("gas", 1), ("thermal capacity", 3)]),
    ("Waves, light & sound", [("wavelength", 3), ("frequency", 3), ("amplitude", 3),
                              ("refractive index", 3), ("refraction", 3), ("reflection", 2),
                              ("lens", 3), ("mirror", 3), ("spectrum", 3), ("ultrasound", 3),
                              ("sound", 2), ("echo", 3), ("prism", 3), ("ray of light", 3),
                              ("microwave", 2), ("total internal reflection", 3),
                              ("transverse", 3), ("longitudinal", 3), ("focal length", 3)]),
    ("Electricity & magnetism", [("circuit", 2), ("resistance", 3), ("resistor", 3),
                                 ("potential difference", 3), ("ammeter", 3), ("voltmeter", 3),
                                 ("fuse", 3), ("light-dependent resistor", 3), ("ldr", 3),
                                 ("thermistor", 3), ("in series", 2), ("in parallel", 2),
                                 ("electrons", 1), ("charge", 2), ("bar magnet", 3),
                                 ("compass", 3), ("induced magnet", 3), ("magnetic pole", 3),
                                 ("current", 1), ("mains", 2)]),
    ("Electromagnetic effects", [("transformer", 3), ("commutator", 3), ("slip ring", 3),
                                 ("electric motor", 3), ("generator", 3), ("solenoid", 3),
                                 ("electromagnet", 3), ("loudspeaker", 3),
                                 ("electromagnetic induction", 3), ("induced e.m.f", 3),
                                 ("coil", 2), ("primary coil", 3), ("secondary coil", 3)]),
    ("Atomic physics", [("nucleus", 3), ("nuclei", 3), ("proton", 3), ("neutron", 3),
                        ("isotope", 3), ("alpha particle", 3), ("beta", 2), ("gamma", 3),
                        ("half-life", 3), ("radioactive", 3), ("fission", 3), ("fusion", 3),
                        ("decay", 2), ("background radiation", 3), ("gold foil", 3),
                        ("nuclear reactor", 3), ("count rate", 3)]),
    ("Space physics", [("planet", 3), ("orbit", 3), ("galax", 3), ("redshift", 3),
                       ("solar system", 3), ("life cycle", 2), ("the sun", 2), ("moon", 3),
                       ("light-year", 3), ("universe", 3), ("big bang", 3), ("star", 2),
                       ("nebula", 3)]),
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
