/**
 * Student-facing assembly contracts for all 50 source-checked 9702 practicals.
 * Adapted/generated, not official Cambridge software.
 * Coordinates are suggested centres in a 1000 x 600 room, NOT pre-placed parts.
 * Begin with an empty workspace and an inventory; students place every component.
 * requires = placement prerequisites, not mandatory use of every alternative item.
 * Connections name component:port endpoints. Electrical endpoints must share actual
 * student-made wires; a switch cannot stand in for topology validation.
 * Links specify initial configuration; source variants require intentional rewiring.
 * Measurement targets reference instrument part IDs. Keep timing manual and on the
 * same physical clock as motion; never substitute an inferred period or stop event.
 * Renderer extensions agreed with integrator: balance, newton-meter, ohmmeter.
 * This file contains no calibration constants, model truth or reference answers.
 */
export const rooms = {
  "9702_m21_33-q1": {
    "title": "Equilibrium of a wooden rod supported by a spring",
    "family": "static_spring_rod",
    "category": "mechanics",
    "parts": [
      {
        "id": "stand",
        "label": "Support stand",
        "kind": "stand",
        "x": 140,
        "y": 300,
        "purpose": "Carry both nails without moving during a trial."
      },
      {
        "id": "pivot",
        "label": "Lower pivot nail",
        "kind": "peg",
        "x": 220,
        "y": 350,
        "purpose": "Locate the rod pivot on the stand.",
        "requires": [
          "stand"
        ]
      },
      {
        "id": "upper",
        "label": "Upper nail and boss",
        "kind": "clamp",
        "x": 230,
        "y": 140,
        "purpose": "Set the spring support above the lower nail.",
        "requires": [
          "stand"
        ]
      },
      {
        "id": "rod",
        "label": "Grooved wooden rod",
        "kind": "rod",
        "x": 440,
        "y": 360,
        "purpose": "Select the groove for the spring loop.",
        "requires": [
          "pivot"
        ]
      },
      {
        "id": "spring",
        "label": "Expendable spring",
        "kind": "spring",
        "x": 350,
        "y": 240,
        "purpose": "Stretch under the rod load.",
        "requires": [
          "upper"
        ]
      },
      {
        "id": "string",
        "label": "Adjustable string loop",
        "kind": "string",
        "x": 420,
        "y": 310,
        "purpose": "Join spring to the selected rod groove.",
        "requires": [
          "spring",
          "rod"
        ]
      },
      {
        "id": "ruler",
        "label": "Metre rule",
        "kind": "ruler",
        "x": 820,
        "y": 130,
        "purpose": "Measure from the selected physical endpoints, with the scale aligned to the apparatus."
      },
      {
        "id": "protractor",
        "label": "Protractor",
        "kind": "protractor",
        "x": 820,
        "y": 280,
        "purpose": "Align the centre and reference axis before reading the angle."
      }
    ],
    "connections": [
      {
        "to": "upper:mount",
        "label": "Fix upper support",
        "from": "stand:boss"
      },
      {
        "to": "rod:pivot",
        "label": "Pivot rod",
        "from": "pivot:tip"
      },
      {
        "to": "spring:top",
        "label": "Suspend spring",
        "from": "upper:hook"
      },
      {
        "to": "string:top",
        "label": "Attach loop",
        "from": "spring:bottom"
      },
      {
        "to": "rod:groove",
        "label": "Select groove",
        "from": "string:bottom"
      }
    ],
    "steps": [
      "Place stand, lower nail and upper support separately.",
      "Mount the rod; attach spring and string; measure the unloaded spring before tensioning.",
      "Move loop and adjust string to horizontal before using ruler; spring stretches and rod tilts when adjustment wrong.",
      "Read the instrument beside the apparatus and transcribe the raw observation before changing the trial."
    ],
    "measurementTargets": [
      {
        "label": "C0, C, x",
        "unit": "m",
        "instrument": "ruler"
      },
      {
        "label": "Rod angle",
        "unit": "degree",
        "instrument": "protractor"
      }
    ],
    "cautions": [
      "Adapted/generated teaching apparatus; not official Cambridge software.",
      "Read x from the pivot, not from the far end; level the rod before measuring extension.",
      "Idealised adapted model; source alignment does not establish physical apparatus calibration."
    ],
    "provisional": false
  },
  "9702_m21_33-q2": {
    "title": "Speed of air flowing through a hole",
    "family": "gas_flow_hole",
    "category": "flow",
    "parts": [
      {
        "id": "bottle",
        "label": "Marked plastic bottle",
        "kind": "bottle",
        "x": 330,
        "y": 250,
        "purpose": "Contain the air volume and expose the moving water interface."
      },
      {
        "id": "membrane",
        "label": "Polythene membrane",
        "kind": "rubber",
        "x": 320,
        "y": 145,
        "purpose": "Cover the bottle opening before piercing.",
        "requires": [
          "bottle"
        ]
      },
      {
        "id": "band",
        "label": "Retaining rubber band",
        "kind": "rubber",
        "x": 450,
        "y": 150,
        "purpose": "Seal the membrane around the opening.",
        "requires": [
          "membrane"
        ]
      },
      {
        "id": "piercer",
        "label": "Pin / nail",
        "kind": "peg",
        "x": 540,
        "y": 220,
        "purpose": "Pierce a selected opening; measure the tool diameter first."
      },
      {
        "id": "bowl",
        "label": "Water bowl",
        "kind": "beaker",
        "x": 340,
        "y": 440,
        "purpose": "Submerge the bottle opening."
      },
      {
        "id": "water",
        "label": "Water for bowl",
        "kind": "water",
        "x": 150,
        "y": 430,
        "purpose": "Fill the bowl before submerging the bottle.",
        "requires": [
          "bowl"
        ]
      },
      {
        "id": "ruler",
        "label": "Metre rule",
        "kind": "ruler",
        "x": 820,
        "y": 130,
        "purpose": "Measure from the selected physical endpoints, with the scale aligned to the apparatus."
      },
      {
        "id": "micrometer",
        "label": "Micrometer",
        "kind": "micrometer",
        "x": 820,
        "y": 270,
        "purpose": "Check zero and close gently on the wire or rubber; read without squeezing."
      },
      {
        "id": "stopwatch",
        "label": "Manual stopwatch",
        "kind": "stopwatch",
        "x": 820,
        "y": 470,
        "purpose": "Start and stop manually at observed events; read elapsed physical time, not the model period."
      }
    ],
    "connections": [
      {
        "to": "bottle:mouth",
        "label": "Cover opening",
        "from": "membrane:rim"
      },
      {
        "to": "membrane:rim",
        "label": "Secure seal",
        "from": "band:loop"
      },
      {
        "to": "membrane:centre",
        "label": "Pierce membrane",
        "from": "piercer:tip"
      },
      {
        "to": "bowl:waterline",
        "label": "Submerge opening",
        "from": "bottle:mouth"
      }
    ],
    "steps": [
      "Place the bowl and add water.",
      "Measure the bottle and piercing tool; attach membrane and band, then pierce.",
      "Pierce membrane, fill/submerge bottle, watch interface fall and manually time between marks.",
      "Read the instrument beside the apparatus and transcribe the raw observation before changing the trial."
    ],
    "measurementTargets": [
      {
        "label": "Bottle length L and diameter D",
        "unit": "m",
        "instrument": "ruler"
      },
      {
        "label": "Piercing tool diameter d",
        "unit": "m",
        "instrument": "micrometer"
      },
      {
        "label": "Interface transit t",
        "unit": "s",
        "instrument": "stopwatch"
      }
    ],
    "cautions": [
      "Adapted/generated teaching apparatus; not official Cambridge software.",
      "Hole diameter can differ from the tool; timing starts and ends at the marked interface crossings.",
      "Idealised adapted model; source alignment does not establish physical apparatus calibration."
    ],
    "provisional": false
  },
  "9702_m22_33-q1": {
    "title": "Density of a liquid",
    "family": "hydrostatic_u_tube",
    "category": "mechanics",
    "parts": [
      {
        "id": "stand",
        "label": "Tube stand",
        "kind": "stand",
        "x": 130,
        "y": 320,
        "purpose": "Keep the limbs vertical."
      },
      {
        "id": "board",
        "label": "Wooden mounting strip",
        "kind": "board",
        "x": 280,
        "y": 280,
        "purpose": "Support the U-tube.",
        "requires": [
          "stand"
        ]
      },
      {
        "id": "tube",
        "label": "Transparent U-tube",
        "kind": "tube",
        "x": 410,
        "y": 290,
        "purpose": "Keep two open limbs connected.",
        "requires": [
          "board"
        ]
      },
      {
        "id": "mass",
        "label": "Tube tensioning mass",
        "kind": "mass",
        "x": 410,
        "y": 450,
        "purpose": "Maintain the source tube geometry.",
        "requires": [
          "tube"
        ]
      },
      {
        "id": "water",
        "label": "Coloured water",
        "kind": "water",
        "x": 130,
        "y": 470,
        "purpose": "Fill the connected lower column."
      },
      {
        "id": "oil",
        "label": "Cooking oil",
        "kind": "oil",
        "x": 550,
        "y": 160,
        "purpose": "Add to one limb without mixing."
      },
      {
        "id": "dropper",
        "label": "Oil dropper",
        "kind": "syringe",
        "x": 570,
        "y": 330,
        "purpose": "Transfer small additions to the right limb."
      },
      {
        "id": "ruler",
        "label": "Metre rule",
        "kind": "ruler",
        "x": 820,
        "y": 130,
        "purpose": "Measure from the selected physical endpoints, with the scale aligned to the apparatus."
      }
    ],
    "connections": [
      {
        "to": "board:mount",
        "label": "Mount strip",
        "from": "stand:boss"
      },
      {
        "to": "tube:left",
        "label": "Support left limb",
        "from": "board:left"
      },
      {
        "to": "tube:right",
        "label": "Support right limb",
        "from": "board:right"
      },
      {
        "to": "mass:hook",
        "label": "Tension tube",
        "from": "tube:bend"
      },
      {
        "to": "tube:right-mouth",
        "label": "Add oil",
        "from": "dropper:nozzle"
      }
    ],
    "steps": [
      "Mount the strip and both tube limbs, then attach the tensioning mass.",
      "Add coloured water; use the dropper to establish the fixed oil column F in limb A, then add oil to limb B for each selected h.",
      "Use pipette to add measured oil; ruler reads interfaces, not a force measurement.",
      "Read the instrument beside the apparatus and transcribe the raw observation before changing the trial."
    ],
    "measurementTargets": [
      {
        "label": "F, h, a, b",
        "unit": "m",
        "instrument": "ruler"
      }
    ],
    "cautions": [
      "Adapted/generated teaching apparatus; not official Cambridge software.",
      "F is a fixed oil-column length, not a force. Keep both limbs open and distinguish both oil/water interfaces from their free surfaces.",
      "Idealised adapted model; source alignment does not establish physical apparatus calibration."
    ],
    "provisional": false
  },
  "9702_m22_33-q2": {
    "title": "Oscillations of a spring system",
    "family": "spring_network_oscillator",
    "category": "oscillation",
    "parts": [
      {
        "id": "stand",
        "label": "Spring support stand",
        "kind": "stand",
        "x": 160,
        "y": 310,
        "purpose": "Hold spring network clear of the bench."
      },
      {
        "id": "clamp",
        "label": "Upper suspension clamp",
        "kind": "clamp",
        "x": 370,
        "y": 100,
        "purpose": "Carry spring branches.",
        "requires": [
          "stand"
        ]
      },
      {
        "id": "lower-clamp",
        "label": "Lower fixed clamp",
        "kind": "clamp",
        "x": 370,
        "y": 515,
        "purpose": "Fix the lower end of the spring train.",
        "requires": [
          "stand"
        ]
      },
      {
        "id": "spring-1",
        "label": "Spring 1",
        "kind": "spring",
        "x": 370,
        "y": 205,
        "purpose": "Spring 1 in the four-spring vertical train.",
        "requires": [
          "clamp"
        ]
      },
      {
        "id": "spring-2",
        "label": "Spring 2",
        "kind": "spring",
        "x": 370,
        "y": 280,
        "purpose": "Spring 2 in the four-spring vertical train.",
        "requires": [
          "spring-1"
        ]
      },
      {
        "id": "spring-3",
        "label": "Spring 3",
        "kind": "spring",
        "x": 370,
        "y": 355,
        "purpose": "Spring 3 in the four-spring vertical train.",
        "requires": [
          "spring-2"
        ]
      },
      {
        "id": "spring-4",
        "label": "Spring 4",
        "kind": "spring",
        "x": 370,
        "y": 430,
        "purpose": "Spring 4 in the four-spring vertical train.",
        "requires": [
          "spring-3"
        ]
      },
      {
        "id": "clay",
        "label": "Modelling clay",
        "kind": "bob",
        "x": 435,
        "y": 235,
        "purpose": "Attach around the selected inter-spring joint without covering the coils.",
        "requires": [
          "spring-1",
          "spring-2"
        ]
      },
      {
        "id": "ruler",
        "label": "Metre rule",
        "kind": "ruler",
        "x": 820,
        "y": 130,
        "purpose": "Measure from the selected physical endpoints, with the scale aligned to the apparatus."
      },
      {
        "id": "stopwatch",
        "label": "Manual stopwatch",
        "kind": "stopwatch",
        "x": 820,
        "y": 470,
        "purpose": "Start and stop manually at observed events; read elapsed physical time, not the model period."
      }
    ],
    "connections": [
      {
        "from": "stand:upper-boss",
        "to": "clamp:mount",
        "label": "Fix upper clamp"
      },
      {
        "from": "stand:lower-boss",
        "to": "lower-clamp:mount",
        "label": "Fix lower clamp"
      },
      {
        "from": "clamp:hook",
        "to": "spring-1:top",
        "label": "Anchor top"
      },
      {
        "from": "spring-1:bottom",
        "to": "spring-2:top",
        "label": "Join springs 1 and 2"
      },
      {
        "from": "spring-2:bottom",
        "to": "spring-3:top",
        "label": "Join springs 2 and 3"
      },
      {
        "from": "spring-3:bottom",
        "to": "spring-4:top",
        "label": "Join springs 3 and 4"
      },
      {
        "from": "spring-4:bottom",
        "to": "lower-clamp:hook",
        "label": "Anchor bottom"
      },
      {
        "from": "clay:attachment",
        "to": "spring-1:bottom",
        "label": "Attach clay at first joint"
      }
    ],
    "steps": [
      "Place the stand and upper and lower clamps, then connect each of the four springs into one vertical train between the fixed clamps.",
      "Measure and shape the clay, then attach it around the joint between springs 1 and 2; use the middle joint for the second source condition.",
      "Cut/shape clay, attach at selected joint, displace, release, count and time oscillations.",
      "Read the instrument beside the apparatus and transcribe the raw observation before changing the trial."
    ],
    "measurementTargets": [
      {
        "label": "Clay diameter d",
        "unit": "m",
        "instrument": "ruler"
      },
      {
        "label": "Elapsed oscillation time",
        "unit": "s",
        "instrument": "stopwatch"
      }
    ],
    "cautions": [
      "Adapted/generated teaching apparatus; not official Cambridge software.",
      "Both ends of the four-spring train are fixed. Move the clay to the selected joint; do not model two freely hanging parallel spring pairs.",
      "Idealised adapted model; source alignment does not establish physical apparatus calibration."
    ],
    "provisional": false
  },
  "9702_m23_33-q1": {
    "title": "Equilibrium of a wooden rod",
    "family": "rod_pulley_equilibrium",
    "category": "mechanics",
    "parts": [
      {
        "id": "stand",
        "label": "Rod support stand",
        "kind": "stand",
        "x": 100,
        "y": 320,
        "purpose": "Support the pivot."
      },
      {
        "id": "pulley-stand",
        "label": "Pulley stand",
        "kind": "stand",
        "x": 590,
        "y": 300,
        "purpose": "Adjust pulley height independently."
      },
      {
        "id": "rod",
        "label": "Notched wooden strip",
        "kind": "rod",
        "x": 300,
        "y": 330,
        "purpose": "Rotate freely about its lower end.",
        "requires": [
          "stand"
        ]
      },
      {
        "id": "pulley",
        "label": "Pulley",
        "kind": "pulley",
        "x": 540,
        "y": 170,
        "purpose": "Redirect the tension over a freely turning wheel.",
        "requires": [
          "pulley-stand"
        ]
      },
      {
        "id": "string",
        "label": "Supporting string",
        "kind": "string",
        "x": 410,
        "y": 250,
        "purpose": "Join a selected notch to the load over the pulley.",
        "requires": [
          "rod",
          "pulley"
        ]
      },
      {
        "id": "mass",
        "label": "Slotted load",
        "kind": "mass",
        "x": 585,
        "y": 420,
        "purpose": "Apply tension through the string.",
        "requires": [
          "string"
        ]
      },
      {
        "id": "plumb",
        "label": "Plumb line",
        "kind": "string",
        "x": 670,
        "y": 260,
        "purpose": "Establish the vertical angle reference."
      },
      {
        "id": "ruler",
        "label": "Metre rule",
        "kind": "ruler",
        "x": 820,
        "y": 130,
        "purpose": "Measure from the selected physical endpoints, with the scale aligned to the apparatus."
      },
      {
        "id": "protractor",
        "label": "Protractor",
        "kind": "protractor",
        "x": 820,
        "y": 280,
        "purpose": "Align the centre and reference axis before reading the angle."
      }
    ],
    "connections": [
      {
        "to": "rod:pivot",
        "label": "Pivot rod",
        "from": "stand:pivot"
      },
      {
        "to": "pulley:axle",
        "label": "Mount pulley",
        "from": "pulley-stand:boss"
      },
      {
        "to": "string:start",
        "label": "Attach at notch",
        "from": "rod:notch"
      },
      {
        "to": "pulley:rim",
        "label": "Pass over pulley",
        "from": "string:over"
      },
      {
        "to": "mass:hook",
        "label": "Hang load",
        "from": "string:end"
      }
    ],
    "steps": [
      "Place the two supports independently.",
      "Pivot the rod, mount the pulley, route the string and hang the load; add the plumb line and measuring instruments.",
      "Move notch, adjust pulley until horizontal, read height and angle with plumb-line/protractor.",
      "Read the instrument beside the apparatus and transcribe the raw observation before changing the trial."
    ],
    "measurementTargets": [
      {
        "label": "H, h, L",
        "unit": "m",
        "instrument": "ruler"
      },
      {
        "label": "Angle from vertical",
        "unit": "degree",
        "instrument": "protractor"
      }
    ],
    "cautions": [
      "Adapted/generated teaching apparatus; not official Cambridge software.",
      "Measure the specified angle from vertical; adjust the pulley until the rod-to-pulley string segment is horizontal.",
      "Idealised adapted model; source alignment does not establish physical apparatus calibration."
    ],
    "provisional": false
  },
  "9702_m23_33-q2": {
    "title": "Optical properties of sugar solution",
    "family": "lens_in_solution",
    "category": "optics",
    "parts": [
      {
        "id": "lamp",
        "label": "LED torch / object",
        "kind": "lamp",
        "x": 130,
        "y": 290,
        "purpose": "Move along the optical axis to focus the image."
      },
      {
        "id": "container",
        "label": "Transparent optical container",
        "kind": "beaker",
        "x": 365,
        "y": 290,
        "purpose": "Hold the lens in the selected liquid."
      },
      {
        "id": "lens",
        "label": "Biconvex lens",
        "kind": "lens",
        "x": 365,
        "y": 280,
        "purpose": "Refract light while immersed.",
        "requires": [
          "container"
        ]
      },
      {
        "id": "water",
        "label": "Water",
        "kind": "water",
        "x": 240,
        "y": 450,
        "purpose": "Provide the initial immersion medium."
      },
      {
        "id": "solution",
        "label": "Sugar solution",
        "kind": "bottle",
        "x": 485,
        "y": 450,
        "purpose": "Replace water for the comparison trial.",
        "optional": true
      },
      {
        "id": "screen",
        "label": "Image screen",
        "kind": "screen",
        "x": 610,
        "y": 290,
        "purpose": "Receive a sharp or blurred real image."
      },
      {
        "id": "ruler",
        "label": "Metre rule",
        "kind": "ruler",
        "x": 820,
        "y": 130,
        "purpose": "Measure from the selected physical endpoints, with the scale aligned to the apparatus."
      }
    ],
    "connections": [
      {
        "to": "container:base",
        "label": "Seat lens in container",
        "from": "lens:holder"
      }
    ],
    "steps": [
      "Place torch, container and screen along a common optical axis.",
      "Seat the lens, add water, and place the ruler along the axis; change liquid only between trials.",
      "Drag torch until LED image sharp; physically blur screen when defocused; ruler gives object/lens/screen positions.",
      "Read the instrument beside the apparatus and transcribe the raw observation before changing the trial."
    ],
    "measurementTargets": [
      {
        "label": "u0, u, v",
        "unit": "cm",
        "instrument": "ruler"
      }
    ],
    "cautions": [
      "Adapted/generated teaching apparatus; not official Cambridge software.",
      "Keep distances referenced to the lens; the paper-specific refractive-index calibration uses centimetres.",
      "Idealised adapted model; source alignment does not establish physical apparatus calibration."
    ],
    "provisional": false
  },
  "9702_m24_33-q1": {
    "title": "Properties of a pendulum",
    "family": "compound_t_pendulum",
    "category": "oscillation",
    "parts": [
      {
        "id": "stand",
        "label": "Pendulum stand",
        "kind": "stand",
        "x": 130,
        "y": 330,
        "purpose": "Support the fixed top pivot."
      },
      {
        "id": "pivot",
        "label": "Pivot nail",
        "kind": "peg",
        "x": 345,
        "y": 140,
        "purpose": "Pass through the fixed central pivot.",
        "requires": [
          "stand"
        ]
      },
      {
        "id": "rod",
        "label": "Vertical drilled stem",
        "kind": "rod",
        "x": 345,
        "y": 320,
        "purpose": "Swing as the lower stem of the T.",
        "requires": [
          "pivot"
        ]
      },
      {
        "id": "crossbar",
        "label": "Horizontal drilled strip",
        "kind": "rod",
        "x": 345,
        "y": 180,
        "purpose": "Carry equal loads symmetrically.",
        "requires": [
          "rod"
        ]
      },
      {
        "id": "mass-left",
        "label": "Left slotted load",
        "kind": "mass",
        "x": 240,
        "y": 215,
        "purpose": "Attach at the chosen left hole.",
        "requires": [
          "crossbar"
        ]
      },
      {
        "id": "mass-right",
        "label": "Equal right slotted load",
        "kind": "mass",
        "x": 470,
        "y": 215,
        "purpose": "Attach at the matching right hole.",
        "requires": [
          "crossbar"
        ]
      },
      {
        "id": "ruler",
        "label": "Metre rule",
        "kind": "ruler",
        "x": 820,
        "y": 130,
        "purpose": "Measure from the selected physical endpoints, with the scale aligned to the apparatus."
      },
      {
        "id": "protractor",
        "label": "Protractor",
        "kind": "protractor",
        "x": 820,
        "y": 280,
        "purpose": "Align the centre and reference axis before reading the angle."
      },
      {
        "id": "stopwatch",
        "label": "Manual stopwatch",
        "kind": "stopwatch",
        "x": 820,
        "y": 470,
        "purpose": "Start and stop manually at observed events; read elapsed physical time, not the model period."
      }
    ],
    "connections": [
      {
        "to": "pivot:mount",
        "label": "Fix pivot",
        "from": "stand:boss"
      },
      {
        "to": "rod:top",
        "label": "Hang stem",
        "from": "pivot:tip"
      },
      {
        "to": "crossbar:centre",
        "label": "Fasten T joint",
        "from": "rod:top"
      },
      {
        "to": "mass-left:hook",
        "label": "Attach left load",
        "from": "crossbar:left-hole"
      },
      {
        "to": "mass-right:hook",
        "label": "Attach matching load",
        "from": "crossbar:right-hole"
      }
    ],
    "steps": [
      "Place the stand and pivot; join the two wooden strips into the T.",
      "Add both equal masses separately at equal distances from the fixed pivot.",
      "Attach equal masses symmetrically on horizontal arms; pull vertical stem aside; release and count.",
      "Read the instrument beside the apparatus and transcribe the raw observation before changing the trial."
    ],
    "measurementTargets": [
      {
        "label": "Load distance x",
        "unit": "m",
        "instrument": "ruler"
      },
      {
        "label": "Release angle",
        "unit": "degree",
        "instrument": "protractor"
      },
      {
        "label": "Elapsed oscillation time",
        "unit": "s",
        "instrument": "stopwatch"
      }
    ],
    "cautions": [
      "Adapted/generated teaching apparatus; not official Cambridge software.",
      "Move the masses, not the pivot; use small angles and count full cycles.",
      "Idealised adapted model; source alignment does not establish physical apparatus calibration."
    ],
    "provisional": false
  },
  "9702_m24_33-q2": {
    "title": "Frictional forces on a wooden strip",
    "family": "ladder_static_friction",
    "category": "mechanics",
    "parts": [
      {
        "id": "stand",
        "label": "Board support",
        "kind": "stand",
        "x": 140,
        "y": 330,
        "purpose": "Hold the board and support geometry."
      },
      {
        "id": "board",
        "label": "Inclined board",
        "kind": "board",
        "x": 370,
        "y": 470,
        "purpose": "Provide the frictional contact surface."
      },
      {
        "id": "wall",
        "label": "Smooth support strip",
        "kind": "rod",
        "x": 180,
        "y": 280,
        "purpose": "Provide the upper contact.",
        "requires": [
          "stand"
        ]
      },
      {
        "id": "rod",
        "label": "Loaded wooden strip",
        "kind": "rod",
        "x": 350,
        "y": 320,
        "purpose": "Place with foot on board and upper end against support."
      },
      {
        "id": "thin-rod",
        "label": "Comparison thin strip",
        "kind": "rod",
        "x": 570,
        "y": 350,
        "purpose": "Replace the loaded strip for the second condition.",
        "optional": true
      },
      {
        "id": "mass",
        "label": "Slotted load",
        "kind": "mass",
        "x": 410,
        "y": 290,
        "purpose": "Attach to the designated end of the strip.",
        "requires": [
          "rod"
        ]
      },
      {
        "id": "ruler",
        "label": "Metre rule",
        "kind": "ruler",
        "x": 820,
        "y": 130,
        "purpose": "Measure from the selected physical endpoints, with the scale aligned to the apparatus."
      },
      {
        "id": "protractor",
        "label": "Protractor",
        "kind": "protractor",
        "x": 820,
        "y": 280,
        "purpose": "Align the centre and reference axis before reading the angle."
      }
    ],
    "connections": [
      {
        "to": "wall:mount",
        "label": "Secure upper support",
        "from": "stand:boss"
      },
      {
        "to": "board:surface",
        "label": "Place foot",
        "from": "rod:foot"
      },
      {
        "to": "wall:surface",
        "label": "Establish upper contact",
        "from": "rod:top"
      },
      {
        "to": "rod:load-point",
        "label": "Attach load",
        "from": "mass:hook"
      }
    ],
    "steps": [
      "Place the board and smooth upper support.",
      "Mount the load on the strip, measure its geometry and place both contacts without pushing.",
      "Translate base, release and observe slipping/sticking; reverse loaded rod then repeat with thin rod.",
      "Read the instrument beside the apparatus and transcribe the raw observation before changing the trial."
    ],
    "measurementTargets": [
      {
        "label": "L, dA, dB",
        "unit": "m",
        "instrument": "ruler"
      },
      {
        "label": "thetaA, thetaB",
        "unit": "degree",
        "instrument": "protractor"
      },
      {
        "label": "M label",
        "unit": "kg",
        "instrument": "mass"
      }
    ],
    "cautions": [
      "Adapted/generated teaching apparatus; not official Cambridge software.",
      "Reverse the loaded strip for the comparison; distinguish a slipping threshold from a pushed release.",
      "Idealised adapted model; source alignment does not establish physical apparatus calibration."
    ],
    "provisional": false
  },
  "9702_m25_33-q1": {
    "title": "Electrical circuit with resistance wire",
    "family": "shorted_resistance_wire",
    "category": "circuit",
    "parts": [
      {
        "id": "cell",
        "label": "DC supply",
        "kind": "cell",
        "x": 130,
        "y": 170,
        "purpose": "Supply the circuit through its positive and negative terminals."
      },
      {
        "id": "switch",
        "label": "Switch",
        "kind": "switch",
        "x": 300,
        "y": 130,
        "purpose": "Keep open while rewiring; closing cannot repair missing or incorrect connections."
      },
      {
        "id": "resistor",
        "label": "Fixed resistor",
        "kind": "resistor",
        "x": 460,
        "y": 145,
        "purpose": "Limit current in series."
      },
      {
        "id": "wire",
        "label": "Nichrome resistance wire",
        "kind": "wire",
        "x": 365,
        "y": 340,
        "purpose": "Provide the active resistance between end terminals.",
        "rotation": 90
      },
      {
        "id": "short",
        "label": "Movable shorting lead",
        "kind": "wire",
        "x": 420,
        "y": 460,
        "purpose": "Bridge the two selected contact positions on the resistance wire.",
        "rotation": 90
      },
      {
        "id": "ruler",
        "label": "Metre rule",
        "kind": "ruler",
        "x": 820,
        "y": 130,
        "purpose": "Measure from the selected physical endpoints, with the scale aligned to the apparatus."
      },
      {
        "id": "ammeter",
        "label": "Ammeter",
        "kind": "ammeter",
        "x": 820,
        "y": 340,
        "purpose": "Insert in series; read current only after a complete powered circuit is assembled."
      }
    ],
    "connections": [
      {
        "to": "switch:a",
        "label": "Supply lead",
        "from": "cell:plus"
      },
      {
        "to": "resistor:a",
        "label": "Series resistor",
        "from": "switch:b"
      },
      {
        "to": "wire:a",
        "label": "Feed resistance wire",
        "from": "resistor:b"
      },
      {
        "to": "ammeter:plus",
        "label": "Series current measurement",
        "from": "wire:b"
      },
      {
        "to": "cell:minus",
        "label": "Return lead",
        "from": "ammeter:minus"
      },
      {
        "to": "wire:clip-left",
        "label": "First shorting contact",
        "from": "short:a"
      },
      {
        "to": "wire:clip-right",
        "label": "Second shorting contact",
        "from": "short:b"
      }
    ],
    "steps": [
      "Place the supply, switch, resistor and resistance wire separately.",
      "Wire the ammeter in series and the shorting lead across the selected wire section; align the ruler.",
      "Move two shorting clips, close switch, read ammeter, reopen before changing x.",
      "Read the instrument beside the apparatus and transcribe the raw observation before changing the trial."
    ],
    "measurementTargets": [
      {
        "label": "Shorted length x",
        "unit": "m",
        "instrument": "ruler"
      },
      {
        "label": "Current I",
        "unit": "A",
        "instrument": "ammeter"
      }
    ],
    "cautions": [
      "Adapted/generated teaching apparatus; not official Cambridge software.",
      "Open the switch before moving either shorting contact.",
      "Idealised adapted model; source alignment does not establish physical apparatus calibration."
    ],
    "provisional": false
  },
  "9702_m25_33-q2": {
    "title": "Thermal properties of plastic pipe",
    "family": "thermal_pipe_lever",
    "category": "thermal",
    "parts": [
      {
        "id": "pipe",
        "label": "PEX pipe",
        "kind": "tube",
        "x": 270,
        "y": 340,
        "purpose": "Contain the water and transfer thermal expansion to the lever."
      },
      {
        "id": "pivot",
        "label": "Lever pivot",
        "kind": "peg",
        "x": 440,
        "y": 295,
        "purpose": "Support the wooden lever near the pipe."
      },
      {
        "id": "lever",
        "label": "Wooden pointer lever",
        "kind": "rod",
        "x": 440,
        "y": 270,
        "purpose": "Amplify the pipe length change.",
        "requires": [
          "pivot"
        ]
      },
      {
        "id": "mass",
        "label": "Lever contact load",
        "kind": "mass",
        "x": 355,
        "y": 245,
        "purpose": "Maintain contact between lever and pipe.",
        "requires": [
          "lever"
        ]
      },
      {
        "id": "water",
        "label": "Hot water",
        "kind": "water",
        "x": 130,
        "y": 160,
        "purpose": "Pour into the pipe to the selected level."
      },
      {
        "id": "cylinder",
        "label": "Measuring cylinder",
        "kind": "cylinder",
        "x": 560,
        "y": 410,
        "purpose": "Measure the water before pouring."
      },
      {
        "id": "thermometer",
        "label": "Thermometer",
        "kind": "thermometer",
        "x": 680,
        "y": 310,
        "purpose": "Read water temperature at the same time as pointer height."
      },
      {
        "id": "ruler",
        "label": "Metre rule",
        "kind": "ruler",
        "x": 820,
        "y": 130,
        "purpose": "Measure from the selected physical endpoints, with the scale aligned to the apparatus."
      }
    ],
    "connections": [
      {
        "to": "lever:pivot",
        "label": "Mount lever",
        "from": "pivot:tip"
      },
      {
        "to": "lever:contact",
        "label": "Seat pipe under lever",
        "from": "pipe:top"
      },
      {
        "to": "mass:hook",
        "label": "Apply contact load",
        "from": "lever:load-point"
      }
    ],
    "steps": [
      "Place the pipe, pivot and lever separately and establish gentle contact.",
      "Place the ruler and thermometer; take cold geometry and temperature readings before measuring and pouring hot water.",
      "Set pipe/lever, measure cold pointer, pour hot water to selected mark, observe slow displacement and take temperature concurrently.",
      "Read the instrument beside the apparatus and transcribe the raw observation before changing the trial."
    ],
    "measurementTargets": [
      {
        "label": "L, s, d, H1, H2",
        "unit": "m",
        "instrument": "ruler"
      },
      {
        "label": "T0, T",
        "unit": "degC",
        "instrument": "thermometer"
      }
    ],
    "cautions": [
      "Adapted/generated teaching apparatus; not official Cambridge software.",
      "Compare pointer height and temperature concurrently; heating is not instantaneous.",
      "Idealised adapted model; source alignment does not establish physical apparatus calibration."
    ],
    "provisional": false
  },
  "9702_s21_33-q1": {
    "title": "Electrical circuit using resistance wires",
    "family": "complementary_series_wires",
    "category": "circuit",
    "parts": [
      {
        "id": "cell",
        "label": "DC supply",
        "kind": "cell",
        "x": 130,
        "y": 170,
        "purpose": "Supply the circuit through its positive and negative terminals."
      },
      {
        "id": "switch",
        "label": "Switch",
        "kind": "switch",
        "x": 300,
        "y": 130,
        "purpose": "Keep open while rewiring; closing cannot repair missing or incorrect connections."
      },
      {
        "id": "wire-a",
        "label": "Nichrome wire",
        "kind": "wire",
        "x": 330,
        "y": 290,
        "purpose": "Select the first active length.",
        "rotation": 90
      },
      {
        "id": "wire-b",
        "label": "Constantan wire",
        "kind": "wire",
        "x": 330,
        "y": 440,
        "purpose": "Select the complementary active length.",
        "rotation": 90
      },
      {
        "id": "clip-g",
        "label": "Contact G",
        "kind": "clamp",
        "x": 480,
        "y": 260,
        "purpose": "Move to measured x on the first wire."
      },
      {
        "id": "clip-h",
        "label": "Contact H",
        "kind": "clamp",
        "x": 480,
        "y": 410,
        "purpose": "Match the x position of G on the second wire."
      },
      {
        "id": "ruler",
        "label": "Metre rule",
        "kind": "ruler",
        "x": 820,
        "y": 130,
        "purpose": "Measure from the selected physical endpoints, with the scale aligned to the apparatus."
      },
      {
        "id": "ammeter",
        "label": "Ammeter",
        "kind": "ammeter",
        "x": 820,
        "y": 340,
        "purpose": "Insert in series; read current only after a complete powered circuit is assembled."
      }
    ],
    "connections": [
      {
        "to": "switch:a",
        "label": "Supply",
        "from": "cell:plus"
      },
      {
        "to": "wire-a:a",
        "label": "First wire feed",
        "from": "switch:b"
      },
      {
        "to": "clip-g:jaw",
        "label": "Contact G",
        "from": "wire-a:slider"
      },
      {
        "to": "clip-h:lead",
        "label": "Join wires in series",
        "from": "clip-g:lead"
      },
      {
        "to": "wire-b:slider",
        "label": "Contact H",
        "from": "clip-h:jaw"
      },
      {
        "to": "ammeter:plus",
        "label": "Series meter",
        "from": "wire-b:b"
      },
      {
        "to": "cell:minus",
        "label": "Return",
        "from": "ammeter:minus"
      }
    ],
    "steps": [
      "Place the two different wires alongside the ruler.",
      "Place both clips independently; build the complete series circuit with ammeter and switch.",
      "Slide G/H to same measured x; close/read/open switch.",
      "Read the instrument beside the apparatus and transcribe the raw observation before changing the trial."
    ],
    "measurementTargets": [
      {
        "label": "L, x",
        "unit": "m",
        "instrument": "ruler"
      },
      {
        "label": "I",
        "unit": "A",
        "instrument": "ammeter"
      }
    ],
    "cautions": [
      "Adapted/generated teaching apparatus; not official Cambridge software.",
      "G and H must correspond to the same ruler position; total active length remains fixed.",
      "Idealised adapted model; source alignment does not establish physical apparatus calibration."
    ],
    "provisional": false
  },
  "9702_s21_33-q2": {
    "title": "Oscillations of a loaded wooden strip",
    "family": "spring_torsional_rod",
    "category": "oscillation",
    "parts": [
      {
        "id": "stand",
        "label": "Support stand",
        "kind": "stand",
        "x": 140,
        "y": 320,
        "purpose": "Hold the suspension and spring."
      },
      {
        "id": "string",
        "label": "Suspension string",
        "kind": "string",
        "x": 330,
        "y": 200,
        "purpose": "Suspend the strip at its axis.",
        "requires": [
          "stand"
        ]
      },
      {
        "id": "rod",
        "label": "Wooden strip",
        "kind": "rod",
        "x": 355,
        "y": 340,
        "purpose": "Rotate under the restoring spring torque.",
        "requires": [
          "string"
        ]
      },
      {
        "id": "spring",
        "label": "Vertical spring",
        "kind": "spring",
        "x": 540,
        "y": 230,
        "purpose": "Apply restoring force at adjustable b.",
        "requires": [
          "stand"
        ]
      },
      {
        "id": "mass-left",
        "label": "Left load",
        "kind": "mass",
        "x": 220,
        "y": 380,
        "purpose": "Attach the specified load on one side.",
        "requires": [
          "rod"
        ]
      },
      {
        "id": "mass-right",
        "label": "Right load",
        "kind": "mass",
        "x": 480,
        "y": 380,
        "purpose": "Attach the different load opposite.",
        "requires": [
          "rod"
        ]
      },
      {
        "id": "ruler",
        "label": "Metre rule",
        "kind": "ruler",
        "x": 820,
        "y": 130,
        "purpose": "Measure from the selected physical endpoints, with the scale aligned to the apparatus."
      },
      {
        "id": "stopwatch",
        "label": "Manual stopwatch",
        "kind": "stopwatch",
        "x": 820,
        "y": 470,
        "purpose": "Start and stop manually at observed events; read elapsed physical time, not the model period."
      }
    ],
    "connections": [
      {
        "to": "string:top",
        "label": "Suspend string",
        "from": "stand:hook"
      },
      {
        "to": "rod:axis",
        "label": "Suspend strip",
        "from": "string:bottom"
      },
      {
        "to": "spring:top",
        "label": "Support spring",
        "from": "stand:spring-hook"
      },
      {
        "to": "rod:attachment",
        "label": "Choose spring attachment",
        "from": "spring:bottom"
      },
      {
        "to": "mass-left:hook",
        "label": "Left load",
        "from": "rod:left"
      },
      {
        "to": "mass-right:hook",
        "label": "Right load",
        "from": "rod:right"
      }
    ],
    "steps": [
      "Place the stand, string and wooden strip.",
      "Add the two loads individually and hang the spring vertically; level the strip before release.",
      "Attach .2kg one side/.1kg opposite, adjust spring vertical and rod horizontal, release then time.",
      "Read the instrument beside the apparatus and transcribe the raw observation before changing the trial."
    ],
    "measurementTargets": [
      {
        "label": "b, d",
        "unit": "m",
        "instrument": "ruler"
      },
      {
        "label": "Elapsed oscillation time",
        "unit": "s",
        "instrument": "stopwatch"
      }
    ],
    "cautions": [
      "Adapted/generated teaching apparatus; not official Cambridge software.",
      "Keep the spring taut and use small rotations; rod inertia need not be negligible.",
      "Idealised adapted model; source alignment does not establish physical apparatus calibration."
    ],
    "provisional": false
  },
  "9702_s21_34-q1": {
    "title": "Oscillations of a chain",
    "family": "catenary_transverse_pendulum",
    "category": "oscillation",
    "parts": [
      {
        "id": "stand-left",
        "label": "Left support",
        "kind": "stand",
        "x": 160,
        "y": 315,
        "purpose": "Set one end of the chain."
      },
      {
        "id": "stand-right",
        "label": "Right support",
        "kind": "stand",
        "x": 600,
        "y": 315,
        "purpose": "Set separation while keeping support heights equal."
      },
      {
        "id": "chain",
        "label": "Paper-clip chain",
        "kind": "chain",
        "x": 375,
        "y": 270,
        "purpose": "Sag freely between the two supports.",
        "requires": [
          "stand-left",
          "stand-right"
        ]
      },
      {
        "id": "mass",
        "label": "Mass hanger",
        "kind": "mass",
        "x": 380,
        "y": 400,
        "purpose": "Attach at the specified chain position.",
        "requires": [
          "chain"
        ]
      },
      {
        "id": "ruler",
        "label": "Metre rule",
        "kind": "ruler",
        "x": 820,
        "y": 130,
        "purpose": "Measure from the selected physical endpoints, with the scale aligned to the apparatus."
      },
      {
        "id": "sag-ruler",
        "label": "Vertical sag rule",
        "kind": "ruler",
        "x": 680,
        "y": 330,
        "purpose": "Measure sag from the horizontal support level."
      },
      {
        "id": "stopwatch",
        "label": "Manual stopwatch",
        "kind": "stopwatch",
        "x": 820,
        "y": 470,
        "purpose": "Start and stop manually at observed events; read elapsed physical time, not the model period."
      }
    ],
    "connections": [
      {
        "to": "chain:left",
        "label": "Attach left end",
        "from": "stand-left:hook"
      },
      {
        "to": "chain:right",
        "label": "Attach right end",
        "from": "stand-right:hook"
      },
      {
        "to": "mass:hook",
        "label": "Attach hanger",
        "from": "chain:centre"
      }
    ],
    "steps": [
      "Place both supports at equal height; attach the two chain ends and hanger.",
      "Place one rule across the supports and the second vertically to read sag.",
      "Move stands horizontally at equal height; measure sag with second rule; push chain out of plane and time.",
      "Read the instrument beside the apparatus and transcribe the raw observation before changing the trial."
    ],
    "measurementTargets": [
      {
        "label": "Support separation",
        "unit": "m",
        "instrument": "ruler"
      },
      {
        "label": "Sag C",
        "unit": "m",
        "instrument": "sag-ruler"
      },
      {
        "label": "Elapsed transverse oscillation time",
        "unit": "s",
        "instrument": "stopwatch"
      }
    ],
    "cautions": [
      "Adapted/generated teaching apparatus; not official Cambridge software.",
      "Displace out of the chain plane; do not substitute an in-plane swinging-bob animation.",
      "Idealised adapted model; source alignment does not establish physical apparatus calibration."
    ],
    "provisional": false
  },
  "9702_s21_34-q2": {
    "title": "Deformation of a foam ring",
    "family": "foam_ring_compression",
    "category": "mechanics",
    "parts": [
      {
        "id": "stand",
        "label": "Lever support",
        "kind": "stand",
        "x": 100,
        "y": 330,
        "purpose": "Support the rod pivot."
      },
      {
        "id": "block",
        "label": "Wooden support block",
        "kind": "board",
        "x": 365,
        "y": 430,
        "purpose": "Support the selected foam ring."
      },
      {
        "id": "foam-a",
        "label": "Foam ring A",
        "kind": "foam",
        "x": 335,
        "y": 340,
        "purpose": "Measure then compress the first ring.",
        "requires": [
          "block"
        ]
      },
      {
        "id": "foam-b",
        "label": "Foam ring B",
        "kind": "foam",
        "x": 565,
        "y": 430,
        "purpose": "Exchange with ring A for the comparison.",
        "optional": true
      },
      {
        "id": "rod",
        "label": "Compression lever",
        "kind": "rod",
        "x": 325,
        "y": 260,
        "purpose": "Rest on the ring and apply preload.",
        "requires": [
          "stand"
        ]
      },
      {
        "id": "mass",
        "label": "Slotted load",
        "kind": "mass",
        "x": 500,
        "y": 295,
        "purpose": "Add the compression load at the marked point.",
        "requires": [
          "rod"
        ]
      },
      {
        "id": "ruler",
        "label": "Metre rule",
        "kind": "ruler",
        "x": 820,
        "y": 130,
        "purpose": "Measure from the selected physical endpoints, with the scale aligned to the apparatus."
      },
      {
        "id": "protractor",
        "label": "Protractor",
        "kind": "protractor",
        "x": 820,
        "y": 280,
        "purpose": "Align the centre and reference axis before reading the angle."
      },
      {
        "id": "caliper",
        "label": "Vernier calipers",
        "kind": "caliper",
        "x": 820,
        "y": 435,
        "purpose": "Select inside or outside jaws and read the actual diameter or thickness."
      }
    ],
    "connections": [
      {
        "to": "rod:pivot",
        "label": "Mount lever",
        "from": "stand:pivot"
      },
      {
        "to": "foam-a:base",
        "label": "Seat first ring",
        "from": "block:top"
      },
      {
        "to": "foam-a:top",
        "label": "Establish preload",
        "from": "rod:contact"
      },
      {
        "to": "mass:hook",
        "label": "Apply load",
        "from": "rod:load-point"
      }
    ],
    "steps": [
      "Place support, block and first ring separately; measure ring diameters.",
      "Mount and level the lever; measure preload height before adding the mass.",
      "Measure ring diameters, place on block, level rod, add mass, use calipers for both heights.",
      "Read the instrument beside the apparatus and transcribe the raw observation before changing the trial."
    ],
    "measurementTargets": [
      {
        "label": "D1, D2, A, B",
        "unit": "m",
        "instrument": "ruler"
      },
      {
        "label": "h1, h2",
        "unit": "m",
        "instrument": "caliper"
      },
      {
        "label": "Lever angle",
        "unit": "degree",
        "instrument": "protractor"
      }
    ],
    "cautions": [
      "Adapted/generated teaching apparatus; not official Cambridge software.",
      "Exchange the rings rather than stacking them; calipers must not compress the foam.",
      "PROVISIONAL SYNTHETIC ADAPTATION — NOT VALIDATED APPARATUS. This source-checked workflow uses uncalibrated synthetic behaviour. It must not be described as physically calibrated, apparatus-faithful, or completed until real-apparatus validation is recorded."
    ],
    "provisional": true
  },
  "9702_s22_33-q1": {
    "title": "Electrical circuit with two resistance wires",
    "family": "parallel_wire_voltage_divider",
    "category": "circuit",
    "parts": [
      {
        "id": "cell",
        "label": "DC supply",
        "kind": "cell",
        "x": 130,
        "y": 170,
        "purpose": "Supply the circuit through its positive and negative terminals."
      },
      {
        "id": "switch",
        "label": "Switch",
        "kind": "switch",
        "x": 300,
        "y": 130,
        "purpose": "Keep open while rewiring; closing cannot repair missing or incorrect connections."
      },
      {
        "id": "resistor",
        "label": "Series resistor",
        "kind": "resistor",
        "x": 440,
        "y": 140,
        "purpose": "Limit the common supply current."
      },
      {
        "id": "wire",
        "label": "Main constantan wire",
        "kind": "wire",
        "x": 350,
        "y": 340,
        "purpose": "Provide left and right active segments.",
        "rotation": 90
      },
      {
        "id": "loose-wire",
        "label": "Full-length loose constantan wire",
        "kind": "wire",
        "x": 350,
        "y": 470,
        "purpose": "Shunt only the left segment of the main wire.",
        "rotation": 90
      },
      {
        "id": "clip",
        "label": "Sliding junction H",
        "kind": "clamp",
        "x": 500,
        "y": 300,
        "purpose": "Set the division point d."
      },
      {
        "id": "ruler",
        "label": "Metre rule",
        "kind": "ruler",
        "x": 820,
        "y": 130,
        "purpose": "Measure from the selected physical endpoints, with the scale aligned to the apparatus."
      },
      {
        "id": "voltmeter-1",
        "label": "V1: left segment",
        "kind": "voltmeter",
        "x": 820,
        "y": 290,
        "purpose": "Connect both leads across the specified component; observe voltage including polarity."
      },
      {
        "id": "voltmeter-2",
        "label": "V2: right segment",
        "kind": "voltmeter",
        "x": 820,
        "y": 450,
        "purpose": "Connect both leads across the specified component; observe voltage including polarity."
      }
    ],
    "connections": [
      {
        "to": "switch:a",
        "label": "Supply",
        "from": "cell:plus"
      },
      {
        "to": "resistor:a",
        "label": "Series resistor",
        "from": "switch:b"
      },
      {
        "to": "wire:a",
        "label": "Wire input",
        "from": "resistor:b"
      },
      {
        "to": "cell:minus",
        "label": "Return",
        "from": "wire:b"
      },
      {
        "to": "wire:slider",
        "label": "Sliding junction",
        "from": "clip:jaw"
      },
      {
        "to": "wire:a",
        "label": "Shunt left end",
        "from": "loose-wire:a"
      },
      {
        "to": "clip:lead",
        "label": "Shunt to H",
        "from": "loose-wire:b"
      },
      {
        "to": "wire:a",
        "label": "V1 positive",
        "from": "voltmeter-1:plus"
      },
      {
        "to": "clip:lead",
        "label": "V1 negative",
        "from": "voltmeter-1:minus"
      },
      {
        "to": "clip:lead",
        "label": "V2 positive",
        "from": "voltmeter-2:plus"
      },
      {
        "to": "wire:b",
        "label": "V2 negative",
        "from": "voltmeter-2:minus"
      }
    ],
    "steps": [
      "Place both wires, supply and series resistor independently.",
      "Attach the loose wire across the left segment and connect a separate voltmeter across each main-wire segment.",
      "Connect full-length loose wire across first segment; move H; close/read both voltmeters/open.",
      "Read the instrument beside the apparatus and transcribe the raw observation before changing the trial."
    ],
    "measurementTargets": [
      {
        "label": "L, d",
        "unit": "m",
        "instrument": "ruler"
      },
      {
        "label": "V1",
        "unit": "V",
        "instrument": "voltmeter-1"
      },
      {
        "label": "V2",
        "unit": "V",
        "instrument": "voltmeter-2"
      }
    ],
    "cautions": [
      "Adapted/generated teaching apparatus; not official Cambridge software.",
      "The loose wire shunts d, not the whole main wire; never infer correct wiring from a closed switch alone.",
      "Idealised adapted model; source alignment does not establish physical apparatus calibration."
    ],
    "provisional": false
  },
  "9702_s22_33-q2": {
    "title": "Motion of two connected masses",
    "family": "wrapping_mass_dynamics",
    "category": "mechanics",
    "parts": [
      {
        "id": "stand",
        "label": "Winding support stand",
        "kind": "stand",
        "x": 170,
        "y": 330,
        "purpose": "Hold the winding peg fixed."
      },
      {
        "id": "peg",
        "label": "Horizontal winding peg",
        "kind": "peg",
        "x": 350,
        "y": 180,
        "purpose": "Redirect the string and allow wrapping.",
        "requires": [
          "stand"
        ]
      },
      {
        "id": "string",
        "label": "Connecting string",
        "kind": "string",
        "x": 365,
        "y": 300,
        "purpose": "Join the unequal masses over the peg.",
        "requires": [
          "peg"
        ]
      },
      {
        "id": "small",
        "label": "Small rotating mass",
        "kind": "mass",
        "x": 520,
        "y": 300,
        "purpose": "Release at the chosen angle.",
        "requires": [
          "string"
        ]
      },
      {
        "id": "heavy",
        "label": "Heavy descending mass",
        "kind": "mass",
        "x": 280,
        "y": 445,
        "purpose": "Stop descending as the string winds.",
        "requires": [
          "string"
        ]
      },
      {
        "id": "ruler",
        "label": "Metre rule",
        "kind": "ruler",
        "x": 820,
        "y": 130,
        "purpose": "Measure from the selected physical endpoints, with the scale aligned to the apparatus."
      },
      {
        "id": "protractor",
        "label": "Protractor",
        "kind": "protractor",
        "x": 820,
        "y": 280,
        "purpose": "Align the centre and reference axis before reading the angle."
      },
      {
        "id": "stopwatch",
        "label": "Manual stopwatch",
        "kind": "stopwatch",
        "x": 820,
        "y": 470,
        "purpose": "Start and stop manually at observed events; read elapsed physical time, not the model period."
      }
    ],
    "connections": [
      {
        "to": "peg:mount",
        "label": "Fix peg",
        "from": "stand:boss"
      },
      {
        "to": "peg:surface",
        "label": "Route string",
        "from": "string:over"
      },
      {
        "to": "heavy:hook",
        "label": "Heavy mass",
        "from": "string:left"
      },
      {
        "to": "small:hook",
        "label": "Small mass",
        "from": "string:right"
      }
    ],
    "steps": [
      "Place the stand and peg; route the string and attach the two unequal masses separately.",
      "Measure the initial geometry and angle with sufficient clearance below the heavy mass.",
      "Set angle using protractor, release, let string wind and heavy mass stop, measure fall; repeat baseline90°.",
      "Read the instrument beside the apparatus and transcribe the raw observation before changing the trial."
    ],
    "measurementTargets": [
      {
        "label": "A, H",
        "unit": "m",
        "instrument": "ruler"
      },
      {
        "label": "Release angle theta",
        "unit": "degree",
        "instrument": "protractor"
      },
      {
        "label": "Optional observed elapsed time",
        "unit": "s",
        "instrument": "stopwatch"
      }
    ],
    "cautions": [
      "Adapted/generated teaching apparatus; not official Cambridge software.",
      "Synthetic endpoint behaviour is uncalibrated; stop before the heavy mass reaches the bench.",
      "PROVISIONAL SYNTHETIC ADAPTATION — NOT VALIDATED APPARATUS. This source-checked workflow uses uncalibrated synthetic behaviour. It must not be described as physically calibrated, apparatus-faithful, or completed until real-apparatus validation is recorded."
    ],
    "provisional": true
  },
  "9702_s22_34-q1": {
    "title": "Capacitor discharge circuit",
    "family": "rc_discharge_parallel",
    "category": "circuit",
    "parts": [
      {
        "id": "cell",
        "label": "DC supply",
        "kind": "cell",
        "x": 130,
        "y": 170,
        "purpose": "Supply the circuit through its positive and negative terminals."
      },
      {
        "id": "switch",
        "label": "Two-way charge/discharge switch",
        "kind": "switch",
        "x": 310,
        "y": 130,
        "purpose": "Choose charge or discharge; isolate the supply during discharge."
      },
      {
        "id": "capacitor",
        "label": "Capacitor",
        "kind": "capacitor",
        "x": 320,
        "y": 360,
        "purpose": "Store charge with correct polarity."
      },
      {
        "id": "fixed",
        "label": "Fixed parallel resistor",
        "kind": "resistor",
        "x": 500,
        "y": 300,
        "purpose": "Remain in the discharge network."
      },
      {
        "id": "resistor",
        "label": "Selectable resistor",
        "kind": "resistor",
        "x": 550,
        "y": 450,
        "purpose": "Exchange between discharged trials."
      },
      {
        "id": "voltmeter",
        "label": "Voltmeter",
        "kind": "voltmeter",
        "x": 820,
        "y": 320,
        "purpose": "Connect both leads across the specified component; observe voltage including polarity."
      },
      {
        "id": "stopwatch",
        "label": "Manual stopwatch",
        "kind": "stopwatch",
        "x": 820,
        "y": 470,
        "purpose": "Start and stop manually at observed events; read elapsed physical time, not the model period."
      }
    ],
    "connections": [
      {
        "to": "switch:charge",
        "label": "Charging supply",
        "from": "cell:plus"
      },
      {
        "to": "capacitor:plus",
        "label": "Switched capacitor terminal",
        "from": "switch:common"
      },
      {
        "to": "cell:minus",
        "label": "Common return",
        "from": "capacitor:minus"
      },
      {
        "to": "fixed:a",
        "label": "Discharge branch",
        "from": "switch:discharge"
      },
      {
        "to": "resistor:a",
        "label": "Selectable parallel branch",
        "from": "switch:discharge"
      },
      {
        "to": "capacitor:minus",
        "label": "Fixed branch return",
        "from": "fixed:b"
      },
      {
        "to": "capacitor:minus",
        "label": "Selectable branch return",
        "from": "resistor:b"
      },
      {
        "to": "capacitor:plus",
        "label": "Measure capacitor positive",
        "from": "voltmeter:plus"
      },
      {
        "to": "capacitor:minus",
        "label": "Measure capacitor negative",
        "from": "voltmeter:minus"
      }
    ],
    "steps": [
      "Place all electrical components separately and connect the two-way switch by its three named terminals.",
      "Wire the two resistors in parallel for discharge and place the voltmeter across the capacitor; charge fully before timing.",
      "Plug selected resistor, charge capacitor, switch discharge and start stopwatch, stop at voltage threshold.",
      "Read the instrument beside the apparatus and transcribe the raw observation before changing the trial."
    ],
    "measurementTargets": [
      {
        "label": "Capacitor voltage V",
        "unit": "V",
        "instrument": "voltmeter"
      },
      {
        "label": "Discharge interval",
        "unit": "s",
        "instrument": "stopwatch"
      }
    ],
    "cautions": [
      "Adapted/generated teaching apparatus; not official Cambridge software.",
      "Discharge must disconnect the supply; manually time the chosen threshold rather than auto-stopping at it.",
      "Idealised adapted model; source alignment does not establish physical apparatus calibration."
    ],
    "provisional": false
  },
  "9702_s22_34-q2": {
    "title": "Comparison of properties of two liquids",
    "family": "liquid_adhesion_drainage",
    "category": "flow",
    "parts": [
      {
        "id": "glass",
        "label": "Glass plate",
        "kind": "board",
        "x": 220,
        "y": 450,
        "purpose": "Provide the fixed adhesion surface."
      },
      {
        "id": "acrylic",
        "label": "Square acrylic plate",
        "kind": "board",
        "x": 235,
        "y": 320,
        "purpose": "Pull away from a liquid film.",
        "requires": [
          "glass"
        ]
      },
      {
        "id": "force-meter",
        "label": "Newton meter",
        "kind": "newton-meter",
        "x": 650,
        "y": 290,
        "purpose": "Pull along the specified line of action and read the spring scale in newtons."
      },
      {
        "id": "water",
        "label": "Water sample",
        "kind": "water",
        "x": 110,
        "y": 170,
        "purpose": "Use for both adhesion and drainage trials."
      },
      {
        "id": "oil",
        "label": "Vegetable oil sample",
        "kind": "oil",
        "x": 290,
        "y": 170,
        "purpose": "Use for the comparison after cleaning."
      },
      {
        "id": "syringe",
        "label": "Drainage syringe",
        "kind": "syringe",
        "x": 470,
        "y": 310,
        "purpose": "Observe the falling liquid between volume marks."
      },
      {
        "id": "beaker",
        "label": "Receiving beaker",
        "kind": "beaker",
        "x": 470,
        "y": 480,
        "purpose": "Collect discharged liquid.",
        "requires": [
          "syringe"
        ]
      },
      {
        "id": "stopwatch",
        "label": "Manual stopwatch",
        "kind": "stopwatch",
        "x": 820,
        "y": 470,
        "purpose": "Start and stop manually at observed events; read elapsed physical time, not the model period."
      }
    ],
    "connections": [
      {
        "to": "force-meter:hook",
        "label": "Pulling connection",
        "from": "acrylic:hook"
      },
      {
        "to": "glass:face",
        "label": "Liquid-film contact",
        "from": "acrylic:face"
      },
      {
        "to": "beaker:mouth",
        "label": "Collect drainage",
        "from": "syringe:nozzle"
      }
    ],
    "steps": [
      "Place the dry acrylic and newton meter; measure dry weight first.",
      "Place the glass plate and liquid film for slow separation; separately fill the syringe above the receiving beaker.",
      "Measure dry weight, create liquid film, pull slowly/read peak; separately time10→1cm³ drain for each liquid.",
      "Read the instrument beside the apparatus and transcribe the raw observation before changing the trial."
    ],
    "measurementTargets": [
      {
        "label": "Dry weight W and peak pulling force F",
        "unit": "N",
        "instrument": "force-meter"
      },
      {
        "label": "Drainage interval T",
        "unit": "s",
        "instrument": "stopwatch"
      }
    ],
    "cautions": [
      "Adapted/generated teaching apparatus; not official Cambridge software.",
      "Adhesion and drainage are separate procedures; clean between liquids and do not force the two methods to agree.",
      "PROVISIONAL SYNTHETIC ADAPTATION — NOT VALIDATED APPARATUS. This source-checked workflow uses uncalibrated synthetic behaviour. It must not be described as physically calibrated, apparatus-faithful, or completed until real-apparatus validation is recorded."
    ],
    "provisional": true
  },
  "9702_s23_33-q1": {
    "title": "Motion of a pendulum",
    "family": "cylinder_wrapped_pendulum",
    "category": "oscillation",
    "parts": [
      {
        "id": "stand",
        "label": "Pendulum support",
        "kind": "stand",
        "x": 120,
        "y": 330,
        "purpose": "Support the clamped cylinder."
      },
      {
        "id": "clamp",
        "label": "Cylinder clamp",
        "kind": "clamp",
        "x": 270,
        "y": 160,
        "purpose": "Fix cylinder orientation.",
        "requires": [
          "stand"
        ]
      },
      {
        "id": "cylinder",
        "label": "Wrapping cylinder",
        "kind": "cylinder",
        "x": 365,
        "y": 220,
        "purpose": "Provide the curved wrapping surface.",
        "requires": [
          "clamp"
        ]
      },
      {
        "id": "string",
        "label": "Pendulum string",
        "kind": "string",
        "x": 440,
        "y": 325,
        "purpose": "Fix at cylinder top and remain tangent as the bob swings.",
        "requires": [
          "cylinder"
        ]
      },
      {
        "id": "bob",
        "label": "Pendulum bob",
        "kind": "bob",
        "x": 450,
        "y": 460,
        "purpose": "Move at the free string end.",
        "requires": [
          "string"
        ]
      },
      {
        "id": "ruler",
        "label": "Metre rule",
        "kind": "ruler",
        "x": 820,
        "y": 130,
        "purpose": "Measure from the selected physical endpoints, with the scale aligned to the apparatus."
      },
      {
        "id": "protractor",
        "label": "Protractor",
        "kind": "protractor",
        "x": 820,
        "y": 280,
        "purpose": "Align the centre and reference axis before reading the angle."
      },
      {
        "id": "stopwatch",
        "label": "Manual stopwatch",
        "kind": "stopwatch",
        "x": 820,
        "y": 470,
        "purpose": "Start and stop manually at observed events; read elapsed physical time, not the model period."
      }
    ],
    "connections": [
      {
        "to": "clamp:mount",
        "label": "Fix clamp",
        "from": "stand:boss"
      },
      {
        "to": "cylinder:body",
        "label": "Clamp cylinder",
        "from": "clamp:jaw"
      },
      {
        "to": "string:fixed",
        "label": "Attach string",
        "from": "cylinder:top"
      },
      {
        "to": "bob:hook",
        "label": "Attach bob",
        "from": "string:free"
      }
    ],
    "steps": [
      "Place stand, clamp and cylinder separately.",
      "Measure the free straight string, attach it at the cylinder top and add the bob before wrapping.",
      "Attach string atop cylinder, measure straight unattached string length L, clamp cylinder; release bob outward.",
      "Read the instrument beside the apparatus and transcribe the raw observation before changing the trial."
    ],
    "measurementTargets": [
      {
        "label": "Free string length L",
        "unit": "m",
        "instrument": "ruler"
      },
      {
        "label": "Release angle",
        "unit": "degree",
        "instrument": "protractor"
      },
      {
        "label": "Elapsed oscillation time",
        "unit": "s",
        "instrument": "stopwatch"
      }
    ],
    "cautions": [
      "Adapted/generated teaching apparatus; not official Cambridge software.",
      "The effective free length changes on wrapping; do not substitute a fixed-length simple pendulum.",
      "Idealised adapted model; source alignment does not establish physical apparatus calibration."
    ],
    "provisional": false
  },
  "9702_s23_33-q2": {
    "title": "Equilibrium of a card",
    "family": "lamina_centroid",
    "category": "mechanics",
    "parts": [
      {
        "id": "stand",
        "label": "Card support stand",
        "kind": "stand",
        "x": 120,
        "y": 330,
        "purpose": "Hold the suspension nail."
      },
      {
        "id": "peg",
        "label": "Suspension nail",
        "kind": "peg",
        "x": 305,
        "y": 150,
        "purpose": "Pass through one selected card hole.",
        "requires": [
          "stand"
        ]
      },
      {
        "id": "card",
        "label": "Sloping-edge card lamina",
        "kind": "card",
        "x": 385,
        "y": 330,
        "purpose": "Suspend from successive holes and mark vertical lines.",
        "requires": [
          "peg"
        ]
      },
      {
        "id": "plumb",
        "label": "Vertical marking line",
        "kind": "string",
        "x": 565,
        "y": 320,
        "purpose": "Provide an adapted visible plumb reference; the source uses vertical line construction.",
        "optional": true
      },
      {
        "id": "square",
        "label": "Set square",
        "kind": "board",
        "x": 660,
        "y": 430,
        "purpose": "Transfer perpendicular reference lines."
      },
      {
        "id": "ruler",
        "label": "Metre rule",
        "kind": "ruler",
        "x": 820,
        "y": 130,
        "purpose": "Measure from the selected physical endpoints, with the scale aligned to the apparatus."
      },
      {
        "id": "stopwatch",
        "label": "Manual stopwatch",
        "kind": "stopwatch",
        "x": 820,
        "y": 470,
        "purpose": "Start and stop manually at observed events; read elapsed physical time, not the model period.",
        "optional": true
      }
    ],
    "connections": [
      {
        "to": "peg:mount",
        "label": "Fix nail",
        "from": "stand:boss"
      },
      {
        "to": "card:hole",
        "label": "Suspend at selected hole",
        "from": "peg:tip"
      },
      {
        "to": "plumb:top",
        "label": "Align vertical reference",
        "from": "peg:tip",
        "optional": true
      }
    ],
    "steps": [
      "Place support, nail and card; choose the first suspension hole.",
      "Place the rule and set square for marking; suspend from additional holes before selecting the intersection.",
      "Punch holes, suspend card, draw three vertical lines, find intersection, trim right edge to x=.09 keeping top slope.",
      "Read the instrument beside the apparatus and transcribe the raw observation before changing the trial."
    ],
    "measurementTargets": [
      {
        "label": "h, x, c, d",
        "unit": "m",
        "instrument": "ruler"
      }
    ],
    "cautions": [
      "Adapted/generated teaching apparatus; not official Cambridge software.",
      "Trim the right edge without uniformly scaling the whole card. Punching and cutting are tool actions, not automatically completed setup.",
      "Idealised adapted model; source alignment does not establish physical apparatus calibration."
    ],
    "provisional": false
  },
  "9702_s23_34-q1": {
    "title": "Oscillations of a counterweighted wooden-rod pendulum",
    "family": "counterweighted_compound_pendulum",
    "category": "oscillation",
    "parts": [
      {
        "id": "stand",
        "label": "Pendulum stand",
        "kind": "stand",
        "x": 150,
        "y": 330,
        "purpose": "Support a fixed central pivot."
      },
      {
        "id": "pivot",
        "label": "Pivot nail",
        "kind": "peg",
        "x": 355,
        "y": 285,
        "purpose": "Pass through the designated rod hole.",
        "requires": [
          "stand"
        ]
      },
      {
        "id": "rod",
        "label": "Drilled wooden strip",
        "kind": "rod",
        "x": 355,
        "y": 320,
        "purpose": "Carry loads above and below the pivot.",
        "requires": [
          "pivot"
        ]
      },
      {
        "id": "upper",
        "label": "Selectable counterweight",
        "kind": "mass",
        "x": 355,
        "y": 160,
        "purpose": "Attach above the pivot.",
        "requires": [
          "rod"
        ]
      },
      {
        "id": "lower",
        "label": "Fixed lower load",
        "kind": "mass",
        "x": 355,
        "y": 475,
        "purpose": "Remain unchanged during the series.",
        "requires": [
          "rod"
        ]
      },
      {
        "id": "ruler",
        "label": "Metre rule",
        "kind": "ruler",
        "x": 820,
        "y": 130,
        "purpose": "Measure from the selected physical endpoints, with the scale aligned to the apparatus."
      },
      {
        "id": "stopwatch",
        "label": "Manual stopwatch",
        "kind": "stopwatch",
        "x": 820,
        "y": 470,
        "purpose": "Start and stop manually at observed events; read elapsed physical time, not the model period."
      }
    ],
    "connections": [
      {
        "to": "pivot:mount",
        "label": "Fix pivot",
        "from": "stand:boss"
      },
      {
        "to": "rod:pivot",
        "label": "Hang strip",
        "from": "pivot:tip"
      },
      {
        "to": "upper:hook",
        "label": "Attach counterweight",
        "from": "rod:upper-hole"
      },
      {
        "to": "lower:hook",
        "label": "Attach fixed load",
        "from": "rod:lower-hole"
      }
    ],
    "steps": [
      "Place stand, pivot and rod; add the fixed lower load.",
      "Place the counterweight separately at the upper attachment and measure the geometry.",
      "Attach selectable masses above central pivot, lower .1kg unchanged, release sideways and time.",
      "Read the instrument beside the apparatus and transcribe the raw observation before changing the trial."
    ],
    "measurementTargets": [
      {
        "label": "Counterweight mass label",
        "unit": "kg",
        "instrument": "upper"
      },
      {
        "label": "Geometry check",
        "unit": "m",
        "instrument": "ruler"
      },
      {
        "label": "Elapsed oscillation time",
        "unit": "s",
        "instrument": "stopwatch"
      }
    ],
    "cautions": [
      "Adapted/generated teaching apparatus; not official Cambridge software.",
      "The lower load stays fixed; use only combinations with positive restoring torque.",
      "Idealised adapted model; source alignment does not establish physical apparatus calibration."
    ],
    "provisional": false
  },
  "9702_s23_34-q2": {
    "title": "Thermal expansion of plastic",
    "family": "thermal_pipe_suspended_lever",
    "category": "thermal",
    "parts": [
      {
        "id": "stand",
        "label": "Lever stand",
        "kind": "stand",
        "x": 130,
        "y": 320,
        "purpose": "Hold the pointer pivot."
      },
      {
        "id": "lever",
        "label": "Wooden pointer lever",
        "kind": "rod",
        "x": 390,
        "y": 160,
        "purpose": "Convert suspension-length change into pointer displacement.",
        "requires": [
          "stand"
        ]
      },
      {
        "id": "string",
        "label": "Pipe suspension string",
        "kind": "string",
        "x": 290,
        "y": 260,
        "purpose": "Suspend the pipe from the short lever arm.",
        "requires": [
          "lever"
        ]
      },
      {
        "id": "pipe",
        "label": "Plastic pipe",
        "kind": "tube",
        "x": 295,
        "y": 390,
        "purpose": "Expand between the suspension holes.",
        "requires": [
          "string"
        ]
      },
      {
        "id": "mass",
        "label": "Bottom contact mass",
        "kind": "mass",
        "x": 295,
        "y": 490,
        "purpose": "Rest on the bench rather than hang freely."
      },
      {
        "id": "water",
        "label": "Hot water",
        "kind": "water",
        "x": 535,
        "y": 380,
        "purpose": "Heat the selected pipe."
      },
      {
        "id": "thermometer",
        "label": "Thermometer",
        "kind": "thermometer",
        "x": 660,
        "y": 300,
        "purpose": "Read water temperature with pointer position."
      },
      {
        "id": "ruler",
        "label": "Metre rule",
        "kind": "ruler",
        "x": 820,
        "y": 130,
        "purpose": "Measure from the selected physical endpoints, with the scale aligned to the apparatus."
      }
    ],
    "connections": [
      {
        "to": "lever:pivot",
        "label": "Mount pointer",
        "from": "stand:pivot"
      },
      {
        "to": "string:top",
        "label": "Suspend string",
        "from": "lever:short-arm"
      },
      {
        "to": "pipe:hole",
        "label": "Suspend pipe",
        "from": "string:bottom"
      },
      {
        "to": "mass:top",
        "label": "Bottom contact",
        "from": "pipe:bottom"
      }
    ],
    "steps": [
      "Place the stand and pointer, then attach suspension string and pipe.",
      "Set the bottom mass on its support; position ruler and thermometer and take cold readings before pouring.",
      "Suspend pipe by short lever arm, mass rests on bottom; heat and measure pointer, change pipe.",
      "Read the instrument beside the apparatus and transcribe the raw observation before changing the trial."
    ],
    "measurementTargets": [
      {
        "label": "L, x1, x2",
        "unit": "m",
        "instrument": "ruler"
      },
      {
        "label": "T0, T",
        "unit": "degC",
        "instrument": "thermometer"
      }
    ],
    "cautions": [
      "Adapted/generated teaching apparatus; not official Cambridge software.",
      "Keep the bottom mass supported and the suspension taut; exchange pipe lengths between trials.",
      "Idealised adapted model; source alignment does not establish physical apparatus calibration."
    ],
    "provisional": false
  },
  "9702_s24_33-q1": {
    "title": "Balanced metre rule",
    "family": "loaded_rule_balance",
    "category": "mechanics",
    "parts": [
      {
        "id": "rod",
        "label": "Balancing metre rule",
        "kind": "ruler",
        "x": 365,
        "y": 290,
        "purpose": "Balance on the knife edge and read pivot position."
      },
      {
        "id": "pivot",
        "label": "Pivot prism",
        "kind": "peg",
        "x": 365,
        "y": 370,
        "purpose": "Slide beneath the rule to find balance."
      },
      {
        "id": "end-mass",
        "label": "Fixed end mass",
        "kind": "mass",
        "x": 175,
        "y": 340,
        "purpose": "Remain at the designated end.",
        "requires": [
          "rod"
        ]
      },
      {
        "id": "transfer",
        "label": "Transferable small masses",
        "kind": "mass",
        "x": 370,
        "y": 235,
        "purpose": "Move masses from the centre to the end; do not add new mass.",
        "requires": [
          "rod"
        ]
      },
      {
        "id": "putty",
        "label": "Adhesive putty",
        "kind": "rubber",
        "x": 540,
        "y": 420,
        "purpose": "Secure load positions without changing the mass between trials."
      },
      {
        "id": "stopwatch",
        "label": "Manual stopwatch",
        "kind": "stopwatch",
        "x": 820,
        "y": 470,
        "purpose": "Start and stop manually at observed events; read elapsed physical time, not the model period.",
        "optional": true
      }
    ],
    "connections": [
      {
        "to": "rod:underside",
        "label": "Support rule",
        "from": "pivot:edge"
      },
      {
        "to": "end-mass:hook",
        "label": "Fix end load",
        "from": "rod:end-point"
      },
      {
        "to": "transfer:base",
        "label": "Place initial transfer masses",
        "from": "rod:centre"
      }
    ],
    "steps": [
      "Place prism and rule separately; locate the unloaded balance point.",
      "Place the end mass and small masses at their source positions, securing them with putty.",
      "Transfer n masses from centre to fixed end mass; slide pivot until no tilt; read y from50cm mark.",
      "Read the instrument beside the apparatus and transcribe the raw observation before changing the trial."
    ],
    "measurementTargets": [
      {
        "label": "a, y",
        "unit": "m",
        "instrument": "rod"
      }
    ],
    "cautions": [
      "Adapted/generated teaching apparatus; not official Cambridge software.",
      "Transfer existing masses from the centre to the end; a balanced appearance alone is not a ruler reading.",
      "Idealised adapted model; source alignment does not establish physical apparatus calibration."
    ],
    "provisional": false
  },
  "9702_s24_33-q2": {
    "title": "Properties of a rubber band",
    "family": "rubber_lateral_contraction",
    "category": "mechanics",
    "parts": [
      {
        "id": "stand",
        "label": "Rubber support stand",
        "kind": "stand",
        "x": 140,
        "y": 330,
        "purpose": "Hold an adjustable upper clamp."
      },
      {
        "id": "clamp",
        "label": "Adjustable clamp",
        "kind": "clamp",
        "x": 345,
        "y": 130,
        "purpose": "Raise to change the band extension.",
        "requires": [
          "stand"
        ]
      },
      {
        "id": "rubber",
        "label": "Rubber band",
        "kind": "rubber",
        "x": 345,
        "y": 300,
        "purpose": "Lengthen and narrow while loaded.",
        "requires": [
          "clamp"
        ]
      },
      {
        "id": "mass",
        "label": "Mass hanger",
        "kind": "mass",
        "x": 345,
        "y": 455,
        "purpose": "Apply the source load.",
        "requires": [
          "rubber"
        ]
      },
      {
        "id": "ruler",
        "label": "Metre rule",
        "kind": "ruler",
        "x": 820,
        "y": 130,
        "purpose": "Measure from the selected physical endpoints, with the scale aligned to the apparatus."
      },
      {
        "id": "micrometer",
        "label": "Micrometer",
        "kind": "micrometer",
        "x": 820,
        "y": 270,
        "purpose": "Check zero and close gently on the wire or rubber; read without squeezing."
      },
      {
        "id": "protractor",
        "label": "Protractor",
        "kind": "protractor",
        "x": 820,
        "y": 440,
        "purpose": "Align the centre and reference axis before reading the angle.",
        "optional": true
      }
    ],
    "connections": [
      {
        "to": "clamp:mount",
        "label": "Fix adjustable clamp",
        "from": "stand:boss"
      },
      {
        "to": "rubber:top",
        "label": "Grip upper end",
        "from": "clamp:jaw"
      },
      {
        "to": "mass:hook",
        "label": "Hang load",
        "from": "rubber:bottom"
      }
    ],
    "steps": [
      "Place stand and clamp; measure relaxed band dimensions before loading.",
      "Attach the band and hanger and align the rule with its full length.",
      "Raise clamp, settle band, measure width without squeezing; ruler measures end-to-end length.",
      "Read the instrument beside the apparatus and transcribe the raw observation before changing the trial."
    ],
    "measurementTargets": [
      {
        "label": "L0, L",
        "unit": "m",
        "instrument": "ruler"
      },
      {
        "label": "w0, w, t",
        "unit": "m",
        "instrument": "micrometer"
      }
    ],
    "cautions": [
      "Adapted/generated teaching apparatus; not official Cambridge software.",
      "Settle before reading; micrometer jaws must not squeeze the stretched rubber.",
      "Idealised adapted model; source alignment does not establish physical apparatus calibration."
    ],
    "provisional": false
  },
  "9702_s24_34-q1": {
    "title": "Equilibrium of a pulley system under added mass",
    "family": "symmetric_movable_pulley",
    "category": "mechanics",
    "parts": [
      {
        "id": "stand-left",
        "label": "Fixed-end stand",
        "kind": "stand",
        "x": 120,
        "y": 320,
        "purpose": "Set one string support height."
      },
      {
        "id": "stand-right",
        "label": "Pulley stand",
        "kind": "stand",
        "x": 605,
        "y": 320,
        "purpose": "Set the fixed pulley at matching height."
      },
      {
        "id": "fixed",
        "label": "Fixed pulley",
        "kind": "pulley",
        "x": 570,
        "y": 160,
        "purpose": "Redirect string to the free hanger.",
        "requires": [
          "stand-right"
        ]
      },
      {
        "id": "pulley",
        "label": "Movable pulley",
        "kind": "pulley",
        "x": 340,
        "y": 345,
        "purpose": "Move vertically with the supported load."
      },
      {
        "id": "string",
        "label": "Supporting thread",
        "kind": "string",
        "x": 350,
        "y": 225,
        "purpose": "Run from fixed support around movable pulley and over fixed pulley."
      },
      {
        "id": "load",
        "label": "Fixed central load M",
        "kind": "mass",
        "x": 340,
        "y": 475,
        "purpose": "Remain attached to the movable pulley throughout the series.",
        "requires": [
          "pulley"
        ]
      },
      {
        "id": "hanger",
        "label": "Variable free-end load Q",
        "kind": "mass",
        "x": 620,
        "y": 430,
        "purpose": "Add the selected masses to this free-end hanger, changing string tension.",
        "requires": [
          "string"
        ]
      },
      {
        "id": "ruler",
        "label": "Metre rule",
        "kind": "ruler",
        "x": 820,
        "y": 130,
        "purpose": "Measure from the selected physical endpoints, with the scale aligned to the apparatus."
      },
      {
        "id": "protractor",
        "label": "Protractor",
        "kind": "protractor",
        "x": 820,
        "y": 280,
        "purpose": "Align the centre and reference axis before reading the angle."
      },
      {
        "id": "plumb",
        "label": "Vertical plumb line",
        "kind": "string",
        "x": 215,
        "y": 220,
        "purpose": "Define the vertical reference for the inclined supporting thread.",
        "requires": [
          "stand-left"
        ]
      }
    ],
    "connections": [
      {
        "to": "string:fixed",
        "label": "Anchor string",
        "from": "stand-left:hook"
      },
      {
        "to": "fixed:axle",
        "label": "Mount fixed pulley",
        "from": "stand-right:boss"
      },
      {
        "to": "pulley:rim",
        "label": "Pass under movable pulley",
        "from": "string:under"
      },
      {
        "to": "fixed:rim",
        "label": "Pass over fixed pulley",
        "from": "string:over"
      },
      {
        "to": "hanger:hook",
        "label": "Attach free hanger",
        "from": "string:free"
      },
      {
        "to": "load:hook",
        "label": "Attach variable load",
        "from": "pulley:hook"
      },
      {
        "from": "stand-left:hook",
        "to": "plumb:top",
        "label": "Hang vertical reference"
      }
    ],
    "steps": [
      "Place supports and both pulleys independently.",
      "Route thread under the movable pulley and over the fixed pulley; attach fixed central load M and variable free-end hanger Q separately, then add the plumb line.",
      "Add weights toQ, settle free pulley, read angle from vertical.",
      "Read the instrument beside the apparatus and transcribe the raw observation before changing the trial."
    ],
    "measurementTargets": [
      {
        "label": "String angle from vertical",
        "unit": "degree",
        "instrument": "protractor"
      },
      {
        "label": "Added mass labels on Q",
        "unit": "kg",
        "instrument": "hanger"
      },
      {
        "label": "Support-height check",
        "unit": "m",
        "instrument": "ruler"
      }
    ],
    "cautions": [
      "Adapted/generated teaching apparatus; not official Cambridge software.",
      "Add masses to the free-end hanger Q, not central load M; maintain equal support heights and sufficient free hanger travel.",
      "Idealised adapted model; source alignment does not establish physical apparatus calibration."
    ],
    "provisional": false
  },
  "9702_s24_34-q2": {
    "title": "Effect of air resistance on a spinning card",
    "family": "falling_mass_rotating_card",
    "category": "mechanics",
    "parts": [
      {
        "id": "stand",
        "label": "Spindle support",
        "kind": "stand",
        "x": 130,
        "y": 330,
        "purpose": "Support the rotating spindle."
      },
      {
        "id": "spindle",
        "label": "Vertical spindle",
        "kind": "rod",
        "x": 315,
        "y": 300,
        "purpose": "Carry the card and wound thread.",
        "requires": [
          "stand"
        ]
      },
      {
        "id": "card",
        "label": "Selectable stiff card",
        "kind": "card",
        "x": 315,
        "y": 165,
        "purpose": "Centre on the spindle after baseline timing.",
        "requires": [
          "spindle"
        ],
        "optional": true
      },
      {
        "id": "pulley",
        "label": "Thread guide pulley",
        "kind": "pulley",
        "x": 545,
        "y": 210,
        "purpose": "Redirect thread toward the falling mass.",
        "requires": [
          "stand"
        ]
      },
      {
        "id": "string",
        "label": "Winding thread",
        "kind": "string",
        "x": 420,
        "y": 290,
        "purpose": "Wind on the spindle without overlapping turns.",
        "requires": [
          "spindle",
          "pulley"
        ]
      },
      {
        "id": "mass",
        "label": "Falling mass",
        "kind": "mass",
        "x": 560,
        "y": 435,
        "purpose": "Drive rotation through its descent.",
        "requires": [
          "string"
        ]
      },
      {
        "id": "ruler",
        "label": "Metre rule",
        "kind": "ruler",
        "x": 820,
        "y": 130,
        "purpose": "Measure from the selected physical endpoints, with the scale aligned to the apparatus."
      },
      {
        "id": "protractor",
        "label": "Protractor",
        "kind": "protractor",
        "x": 820,
        "y": 280,
        "purpose": "Align the centre and reference axis before reading the angle."
      },
      {
        "id": "stopwatch",
        "label": "Manual stopwatch",
        "kind": "stopwatch",
        "x": 820,
        "y": 470,
        "purpose": "Start and stop manually at observed events; read elapsed physical time, not the model period."
      }
    ],
    "connections": [
      {
        "to": "spindle:axle",
        "label": "Mount spindle",
        "from": "stand:bearing"
      },
      {
        "to": "card:centre",
        "label": "Centre card",
        "from": "spindle:top",
        "optional": true
      },
      {
        "to": "spindle:drum",
        "label": "Wind thread",
        "from": "string:wound"
      },
      {
        "to": "pulley:rim",
        "label": "Route thread",
        "from": "string:over"
      },
      {
        "to": "mass:hook",
        "label": "Hang driving mass",
        "from": "string:free"
      }
    ],
    "steps": [
      "Place stand, spindle and pulley; wind the thread and attach the falling mass.",
      "Measure the card separately; time a card-free baseline before attaching the centred card.",
      "Wind, centre card, release, time same fall distance.",
      "Read the instrument beside the apparatus and transcribe the raw observation before changing the trial."
    ],
    "measurementTargets": [
      {
        "label": "Card L, W",
        "unit": "m",
        "instrument": "ruler"
      },
      {
        "label": "Baseline T0 and loaded T",
        "unit": "s",
        "instrument": "stopwatch"
      }
    ],
    "cautions": [
      "Adapted/generated teaching apparatus; not official Cambridge software.",
      "Use the same fall distance each trial; card drag remains uncalibrated and card inertia is not zero.",
      "PROVISIONAL SYNTHETIC ADAPTATION — NOT VALIDATED APPARATUS. This source-checked workflow uses uncalibrated synthetic behaviour. It must not be described as physically calibrated, apparatus-faithful, or completed until real-apparatus validation is recorded."
    ],
    "provisional": true
  },
  "9702_s25_33-q1": {
    "title": "Electrical circuit with nichrome wire",
    "family": "wire_shunt_equal_resistors",
    "category": "circuit",
    "parts": [
      {
        "id": "cell",
        "label": "DC supply",
        "kind": "cell",
        "x": 130,
        "y": 170,
        "purpose": "Supply the circuit through its positive and negative terminals."
      },
      {
        "id": "switch",
        "label": "Switch",
        "kind": "switch",
        "x": 300,
        "y": 130,
        "purpose": "Keep open while rewiring; closing cannot repair missing or incorrect connections."
      },
      {
        "id": "resistor-a",
        "label": "Unshunted fixed resistor",
        "kind": "resistor",
        "x": 300,
        "y": 320,
        "purpose": "Measure the voltage across this resistor."
      },
      {
        "id": "resistor-b",
        "label": "Equal shunted resistor",
        "kind": "resistor",
        "x": 500,
        "y": 320,
        "purpose": "Connect the variable wire across this resistor."
      },
      {
        "id": "wire",
        "label": "Nichrome shunt wire",
        "kind": "wire",
        "x": 510,
        "y": 460,
        "purpose": "Vary active shunt length.",
        "rotation": 90
      },
      {
        "id": "clip",
        "label": "Shunt length contact",
        "kind": "clamp",
        "x": 610,
        "y": 435,
        "purpose": "Set the active wire endpoint."
      },
      {
        "id": "ruler",
        "label": "Metre rule",
        "kind": "ruler",
        "x": 820,
        "y": 130,
        "purpose": "Measure from the selected physical endpoints, with the scale aligned to the apparatus."
      },
      {
        "id": "voltmeter",
        "label": "Voltmeter",
        "kind": "voltmeter",
        "x": 820,
        "y": 320,
        "purpose": "Connect both leads across the specified component; observe voltage including polarity."
      }
    ],
    "connections": [
      {
        "to": "switch:a",
        "label": "Supply",
        "from": "cell:plus"
      },
      {
        "to": "resistor-a:a",
        "label": "First series resistor",
        "from": "switch:b"
      },
      {
        "to": "resistor-b:a",
        "label": "Series junction",
        "from": "resistor-a:b"
      },
      {
        "to": "cell:minus",
        "label": "Return",
        "from": "resistor-b:b"
      },
      {
        "to": "resistor-b:a",
        "label": "Shunt start",
        "from": "wire:a"
      },
      {
        "to": "clip:jaw",
        "label": "Shunt contact",
        "from": "wire:slider"
      },
      {
        "to": "resistor-b:b",
        "label": "Shunt end",
        "from": "clip:lead"
      },
      {
        "to": "resistor-a:a",
        "label": "Voltmeter positive",
        "from": "voltmeter:plus"
      },
      {
        "to": "resistor-a:b",
        "label": "Voltmeter negative",
        "from": "voltmeter:minus"
      }
    ],
    "steps": [
      "Place both equal resistors separately; measure the supply with the voltmeter first.",
      "Build the series circuit, add the wire shunt across only the second resistor, and move the voltmeter across the unshunted resistor.",
      "Measure supply E, wire equal-resistor circuit, vary wire shunt and measure voltage across unshuntedR.",
      "Read the instrument beside the apparatus and transcribe the raw observation before changing the trial."
    ],
    "measurementTargets": [
      {
        "label": "Supply E and resistor V",
        "unit": "V",
        "instrument": "voltmeter"
      },
      {
        "label": "Wire length L",
        "unit": "m",
        "instrument": "ruler"
      }
    ],
    "cautions": [
      "Adapted/generated teaching apparatus; not official Cambridge software.",
      "Supply measurement requires moving both meter leads; final voltage is across the unshunted resistor.",
      "Idealised adapted model; source alignment does not establish physical apparatus calibration."
    ],
    "provisional": false
  },
  "9702_s25_33-q2": {
    "title": "Oscillations of a chain of paper clips",
    "family": "asymmetric_loaded_chain",
    "category": "oscillation",
    "parts": [
      {
        "id": "stand-left",
        "label": "Left chain support",
        "kind": "stand",
        "x": 140,
        "y": 320,
        "purpose": "Hold the chain at its first end."
      },
      {
        "id": "stand-right",
        "label": "Right chain support",
        "kind": "stand",
        "x": 620,
        "y": 320,
        "purpose": "Set the required separation."
      },
      {
        "id": "chain",
        "label": "Countable paper-clip chain",
        "kind": "chain",
        "x": 385,
        "y": 270,
        "purpose": "Expose individual attachment positions.",
        "requires": [
          "stand-left",
          "stand-right"
        ]
      },
      {
        "id": "clay-a",
        "label": "First clay sphere",
        "kind": "bob",
        "x": 330,
        "y": 410,
        "purpose": "Attach at the counted clip position.",
        "requires": [
          "chain"
        ]
      },
      {
        "id": "clay-b",
        "label": "Second clay sphere",
        "kind": "bob",
        "x": 545,
        "y": 465,
        "purpose": "Combine with the first sphere for the comparison.",
        "optional": true
      },
      {
        "id": "ruler",
        "label": "Metre rule",
        "kind": "ruler",
        "x": 820,
        "y": 130,
        "purpose": "Measure from the selected physical endpoints, with the scale aligned to the apparatus."
      },
      {
        "id": "protractor",
        "label": "Protractor",
        "kind": "protractor",
        "x": 820,
        "y": 280,
        "purpose": "Align the centre and reference axis before reading the angle."
      },
      {
        "id": "stopwatch",
        "label": "Manual stopwatch",
        "kind": "stopwatch",
        "x": 820,
        "y": 470,
        "purpose": "Start and stop manually at observed events; read elapsed physical time, not the model period."
      }
    ],
    "connections": [
      {
        "to": "chain:left",
        "label": "Fix left end",
        "from": "stand-left:hook"
      },
      {
        "to": "chain:right",
        "label": "Fix right end",
        "from": "stand-right:hook"
      },
      {
        "to": "clay-a:attachment",
        "label": "Attach measured clay",
        "from": "chain:counted-clip"
      }
    ],
    "steps": [
      "Place both supports and attach the chain ends.",
      "Measure clay, count the specified clips and attach the clay at that actual chain position.",
      "Measure clay, position stands, count11 then7 clips, displace/time; combine spheres between trials.",
      "Read the instrument beside the apparatus and transcribe the raw observation before changing the trial."
    ],
    "measurementTargets": [
      {
        "label": "Clay diameter d and support distance x",
        "unit": "m",
        "instrument": "ruler"
      },
      {
        "label": "Elapsed oscillation time",
        "unit": "s",
        "instrument": "stopwatch"
      }
    ],
    "cautions": [
      "Adapted/generated teaching apparatus; not official Cambridge software.",
      "Count clips explicitly and combine clay only between trials; the chain response is provisional, not evidence for the proposed law.",
      "PROVISIONAL SYNTHETIC ADAPTATION — NOT VALIDATED APPARATUS. This source-checked workflow uses uncalibrated synthetic behaviour. It must not be described as physically calibrated, apparatus-faithful, or completed until real-apparatus validation is recorded."
    ],
    "provisional": true
  },
  "9702_s25_34-q1": {
    "title": "Properties of a pendulum",
    "family": "interrupted_pendulum",
    "category": "oscillation",
    "parts": [
      {
        "id": "stand",
        "label": "Pendulum stand",
        "kind": "stand",
        "x": 120,
        "y": 330,
        "purpose": "Carry both support rods."
      },
      {
        "id": "upper",
        "label": "Upper support rod",
        "kind": "rod",
        "x": 330,
        "y": 120,
        "purpose": "Anchor the adjustable pendulum string.",
        "requires": [
          "stand"
        ]
      },
      {
        "id": "peg",
        "label": "Lower interruption rod",
        "kind": "rod",
        "x": 390,
        "y": 285,
        "purpose": "Just contact the hanging string.",
        "requires": [
          "stand"
        ]
      },
      {
        "id": "clip",
        "label": "String length clip",
        "kind": "clamp",
        "x": 460,
        "y": 130,
        "purpose": "Secure the chosen top string length.",
        "requires": [
          "upper"
        ]
      },
      {
        "id": "string",
        "label": "Pendulum string",
        "kind": "string",
        "x": 390,
        "y": 315,
        "purpose": "Swing with a changed radius on the peg side.",
        "requires": [
          "clip"
        ]
      },
      {
        "id": "bob",
        "label": "Pendulum bob",
        "kind": "bob",
        "x": 390,
        "y": 465,
        "purpose": "Move on the two arcs of one complete cycle.",
        "requires": [
          "string"
        ]
      },
      {
        "id": "ruler",
        "label": "Metre rule",
        "kind": "ruler",
        "x": 820,
        "y": 130,
        "purpose": "Measure from the selected physical endpoints, with the scale aligned to the apparatus."
      },
      {
        "id": "protractor",
        "label": "Protractor",
        "kind": "protractor",
        "x": 820,
        "y": 280,
        "purpose": "Align the centre and reference axis before reading the angle."
      },
      {
        "id": "stopwatch",
        "label": "Manual stopwatch",
        "kind": "stopwatch",
        "x": 820,
        "y": 470,
        "purpose": "Start and stop manually at observed events; read elapsed physical time, not the model period."
      }
    ],
    "connections": [
      {
        "to": "upper:mount",
        "label": "Mount upper rod",
        "from": "stand:upper-boss"
      },
      {
        "to": "peg:mount",
        "label": "Mount obstruction",
        "from": "stand:lower-boss"
      },
      {
        "to": "clip:jaw",
        "label": "Secure length clip",
        "from": "upper:hole"
      },
      {
        "to": "string:top",
        "label": "Suspend string",
        "from": "clip:hook"
      },
      {
        "to": "bob:hook",
        "label": "Attach bob",
        "from": "string:bottom"
      }
    ],
    "steps": [
      "Place the stand and both rods separately.",
      "Attach string, clip and bob; align the lower rod so it just intercepts the string and measure both effective lengths.",
      "Adjust string in top hole, lower rodfixed just touches string; release/time asymmetric full swings.",
      "Read the instrument beside the apparatus and transcribe the raw observation before changing the trial."
    ],
    "measurementTargets": [
      {
        "label": "L1, L2",
        "unit": "m",
        "instrument": "ruler"
      },
      {
        "label": "Release angle",
        "unit": "degree",
        "instrument": "protractor"
      },
      {
        "label": "Elapsed full-cycle time",
        "unit": "s",
        "instrument": "stopwatch"
      }
    ],
    "cautions": [
      "Adapted/generated teaching apparatus; not official Cambridge software.",
      "One full cycle contains both arcs; keep the bob clear of the lower rod.",
      "Idealised adapted model; source alignment does not establish physical apparatus calibration."
    ],
    "provisional": false
  },
  "9702_s25_34-q2": {
    "title": "Steel balls falling through water",
    "family": "confined_ball_settling",
    "category": "flow",
    "parts": [
      {
        "id": "tube",
        "label": "Clear vertical settling tube",
        "kind": "tube",
        "x": 300,
        "y": 310,
        "purpose": "Expose the two timing marks."
      },
      {
        "id": "water",
        "label": "Water",
        "kind": "water",
        "x": 140,
        "y": 180,
        "purpose": "Fill the tube without trapped bubbles."
      },
      {
        "id": "ball",
        "label": "Selected steel sphere",
        "kind": "ball",
        "x": 300,
        "y": 115,
        "purpose": "Release centrally above the upper timing mark."
      },
      {
        "id": "ball-spare",
        "label": "Comparison steel sphere",
        "kind": "ball",
        "x": 530,
        "y": 160,
        "purpose": "Exchange sphere diameter between trial sets.",
        "optional": true
      },
      {
        "id": "magnet",
        "label": "Retrieval magnet",
        "kind": "magnet",
        "x": 530,
        "y": 330,
        "purpose": "Recover spheres after each run.",
        "optional": true
      },
      {
        "id": "syringe",
        "label": "Filling syringe",
        "kind": "syringe",
        "x": 550,
        "y": 475,
        "purpose": "Fill or top up the tube.",
        "optional": true
      },
      {
        "id": "ruler",
        "label": "Metre rule",
        "kind": "ruler",
        "x": 820,
        "y": 130,
        "purpose": "Measure from the selected physical endpoints, with the scale aligned to the apparatus."
      },
      {
        "id": "caliper",
        "label": "Vernier calipers",
        "kind": "caliper",
        "x": 820,
        "y": 280,
        "purpose": "Select inside or outside jaws and read the actual diameter or thickness."
      },
      {
        "id": "stopwatch",
        "label": "Manual stopwatch",
        "kind": "stopwatch",
        "x": 820,
        "y": 470,
        "purpose": "Start and stop manually at observed events; read elapsed physical time, not the model period."
      }
    ],
    "connections": [
      {
        "to": "tube:mouth",
        "label": "Fill tube",
        "from": "syringe:nozzle",
        "optional": true
      }
    ],
    "steps": [
      "Place the tube, measure its internal diameter and the selected sphere with calipers.",
      "Fill with water, set timing marks, then place the selected sphere above the tube for release.",
      "Watch sphere descend; start/stop at tape edges; repeat both sizes.",
      "Read the instrument beside the apparatus and transcribe the raw observation before changing the trial."
    ],
    "measurementTargets": [
      {
        "label": "Tube D and sphere d",
        "unit": "m",
        "instrument": "caliper"
      },
      {
        "label": "Timing-mark separation",
        "unit": "m",
        "instrument": "ruler"
      },
      {
        "label": "Transit time",
        "unit": "s",
        "instrument": "stopwatch"
      }
    ],
    "cautions": [
      "Adapted/generated teaching apparatus; not official Cambridge software.",
      "Retrieve only after timing. Strong wall confinement makes unbounded Stokes-law motion unsuitable.",
      "PROVISIONAL SYNTHETIC ADAPTATION — NOT VALIDATED APPARATUS. This source-checked workflow uses uncalibrated synthetic behaviour. It must not be described as physically calibrated, apparatus-faithful, or completed until real-apparatus validation is recorded."
    ],
    "provisional": true
  },
  "9702_w21_33-q1": {
    "title": "Combinations of resistors",
    "family": "parallel_resistor_network",
    "category": "circuit",
    "parts": [
      {
        "id": "cell",
        "label": "DC supply",
        "kind": "cell",
        "x": 130,
        "y": 170,
        "purpose": "Supply the circuit through its positive and negative terminals."
      },
      {
        "id": "switch",
        "label": "Switch",
        "kind": "switch",
        "x": 300,
        "y": 130,
        "purpose": "Keep open while rewiring; closing cannot repair missing or incorrect connections."
      },
      {
        "id": "fixed",
        "label": "Fixed series resistor Z",
        "kind": "resistor",
        "x": 460,
        "y": 140,
        "purpose": "Remain in series with the selected parallel pair."
      },
      {
        "id": "resistor-a",
        "label": "First selected resistor",
        "kind": "resistor",
        "x": 310,
        "y": 300,
        "purpose": "Provide the first parallel branch."
      },
      {
        "id": "resistor-b",
        "label": "Second selected resistor",
        "kind": "resistor",
        "x": 520,
        "y": 300,
        "purpose": "Provide the second parallel branch."
      },
      {
        "id": "holder",
        "label": "Component holder board",
        "kind": "board",
        "x": 400,
        "y": 450,
        "purpose": "Seat resistors while leaving named terminals accessible."
      },
      {
        "id": "ammeter",
        "label": "Ammeter",
        "kind": "ammeter",
        "x": 820,
        "y": 340,
        "purpose": "Insert in series; read current only after a complete powered circuit is assembled."
      }
    ],
    "connections": [
      {
        "to": "switch:a",
        "label": "Supply",
        "from": "cell:plus"
      },
      {
        "to": "fixed:a",
        "label": "Fixed series resistor",
        "from": "switch:b"
      },
      {
        "to": "resistor-a:a",
        "label": "First branch feed",
        "from": "fixed:b"
      },
      {
        "to": "resistor-b:a",
        "label": "Common branch input",
        "from": "resistor-a:a"
      },
      {
        "to": "resistor-b:b",
        "label": "Common branch output",
        "from": "resistor-a:b"
      },
      {
        "to": "ammeter:plus",
        "label": "Series ammeter",
        "from": "resistor-a:b"
      },
      {
        "to": "cell:minus",
        "label": "Return",
        "from": "ammeter:minus"
      }
    ],
    "steps": [
      "Place the supply, holder board, fixed resistor and two selected resistors.",
      "Join the selected pair in parallel and put that pair in series with Z, switch and ammeter.",
      "Insert chosen parallel resistors, close/read/open switch.",
      "Read the instrument beside the apparatus and transcribe the raw observation before changing the trial."
    ],
    "measurementTargets": [
      {
        "label": "Current I",
        "unit": "A",
        "instrument": "ammeter"
      }
    ],
    "cautions": [
      "Adapted/generated teaching apparatus; not official Cambridge software.",
      "Exchange selected resistors only with the switch open; the two branches must share both endpoints.",
      "Idealised adapted model; source alignment does not establish physical apparatus calibration."
    ],
    "provisional": false
  },
  "9702_w21_33-q2": {
    "title": "Falling filter papers",
    "family": "filter_paper_fall",
    "category": "mechanics",
    "parts": [
      {
        "id": "stand",
        "label": "Release-height stand",
        "kind": "stand",
        "x": 150,
        "y": 330,
        "purpose": "Mark a repeatable release height."
      },
      {
        "id": "paper",
        "label": "Filter-paper stack",
        "kind": "card",
        "x": 355,
        "y": 140,
        "purpose": "Fall as the selected coherent stack."
      },
      {
        "id": "paper-spare",
        "label": "Other-size filter papers",
        "kind": "card",
        "x": 540,
        "y": 440,
        "purpose": "Change stack size between trials.",
        "optional": true
      },
      {
        "id": "clay",
        "label": "Modelling clay",
        "kind": "bob",
        "x": 580,
        "y": 150,
        "purpose": "Add the specified loading to the paper stack.",
        "requires": [
          "paper"
        ]
      },
      {
        "id": "ruler",
        "label": "Metre rule",
        "kind": "ruler",
        "x": 820,
        "y": 130,
        "purpose": "Measure from the selected physical endpoints, with the scale aligned to the apparatus."
      },
      {
        "id": "balance",
        "label": "Digital balance",
        "kind": "balance",
        "x": 820,
        "y": 340,
        "purpose": "Zero the pan and place the actual measured object on it; read mass."
      },
      {
        "id": "stopwatch",
        "label": "Manual stopwatch",
        "kind": "stopwatch",
        "x": 820,
        "y": 470,
        "purpose": "Start and stop manually at observed events; read elapsed physical time, not the model period."
      }
    ],
    "connections": [
      {
        "to": "clay:base",
        "label": "Attach centred clay",
        "from": "paper:centre"
      }
    ],
    "steps": [
      "Place the height reference and ruler; measure the selected paper diameter.",
      "Assemble the paper stack and clay, weigh the complete falling object and hold it at the release mark.",
      "Measure diameter and total stack mass, release at ruler top, manually time bench impact.",
      "Read the instrument beside the apparatus and transcribe the raw observation before changing the trial."
    ],
    "measurementTargets": [
      {
        "label": "Paper diameter d",
        "unit": "m",
        "instrument": "ruler"
      },
      {
        "label": "Total stack mass m",
        "unit": "kg",
        "instrument": "balance"
      },
      {
        "label": "Fall time t",
        "unit": "s",
        "instrument": "stopwatch"
      }
    ],
    "cautions": [
      "Adapted/generated teaching apparatus; not official Cambridge software.",
      "Release without tilt or push; manually stop at impact. Flutter and separation are outside the ideal coherent-stack model.",
      "Idealised adapted model; source alignment does not establish physical apparatus calibration."
    ],
    "provisional": false
  },
  "9702_w21_34-q1": {
    "title": "Electrical circuit with two resistance wires",
    "family": "wire_bridge_null",
    "category": "circuit",
    "parts": [
      {
        "id": "cell",
        "label": "DC supply",
        "kind": "cell",
        "x": 130,
        "y": 170,
        "purpose": "Supply the circuit through its positive and negative terminals."
      },
      {
        "id": "switch",
        "label": "Switch",
        "kind": "switch",
        "x": 300,
        "y": 130,
        "purpose": "Keep open while rewiring; closing cannot repair missing or incorrect connections."
      },
      {
        "id": "resistor-m",
        "label": "Upper divider resistor M",
        "kind": "resistor",
        "x": 300,
        "y": 270,
        "purpose": "Form the fixed divider branch."
      },
      {
        "id": "resistor-n",
        "label": "Lower divider resistor N",
        "kind": "resistor",
        "x": 300,
        "y": 440,
        "purpose": "Complete the fixed divider branch."
      },
      {
        "id": "wire-top",
        "label": "Upper resistance wire",
        "kind": "wire",
        "x": 550,
        "y": 270,
        "purpose": "Select active length p.",
        "rotation": 90
      },
      {
        "id": "wire-bottom",
        "label": "Lower resistance wire",
        "kind": "wire",
        "x": 550,
        "y": 440,
        "purpose": "Select active length L minus q.",
        "rotation": 90
      },
      {
        "id": "clip-a",
        "label": "Upper contact A",
        "kind": "clamp",
        "x": 635,
        "y": 240,
        "purpose": "Set p independently."
      },
      {
        "id": "clip-c",
        "label": "Lower contact C",
        "kind": "clamp",
        "x": 635,
        "y": 410,
        "purpose": "Search for null by changing q."
      },
      {
        "id": "ruler",
        "label": "Metre rule",
        "kind": "ruler",
        "x": 820,
        "y": 130,
        "purpose": "Measure from the selected physical endpoints, with the scale aligned to the apparatus."
      },
      {
        "id": "voltmeter",
        "label": "Voltmeter",
        "kind": "voltmeter",
        "x": 820,
        "y": 320,
        "purpose": "Connect both leads across the specified component; observe voltage including polarity."
      }
    ],
    "connections": [
      {
        "to": "switch:a",
        "label": "Supply",
        "from": "cell:plus"
      },
      {
        "to": "resistor-m:a",
        "label": "Divider input",
        "from": "switch:b"
      },
      {
        "to": "resistor-n:a",
        "label": "Fixed divider midpoint",
        "from": "resistor-m:b"
      },
      {
        "to": "cell:minus",
        "label": "Divider return",
        "from": "resistor-n:b"
      },
      {
        "to": "clip-a:lead",
        "label": "Wire branch input",
        "from": "switch:b"
      },
      {
        "to": "wire-top:slider",
        "label": "Set p contact",
        "from": "clip-a:jaw"
      },
      {
        "to": "wire-bottom:b",
        "label": "Wire branch midpoint",
        "from": "wire-top:a"
      },
      {
        "to": "clip-c:jaw",
        "label": "Set q contact",
        "from": "wire-bottom:slider"
      },
      {
        "to": "cell:minus",
        "label": "Wire branch return",
        "from": "clip-c:lead"
      },
      {
        "to": "wire-top:a",
        "label": "Detector wire midpoint",
        "from": "voltmeter:plus"
      },
      {
        "to": "resistor-m:b",
        "label": "Detector fixed midpoint",
        "from": "voltmeter:minus"
      }
    ],
    "steps": [
      "Place both wires and both fixed resistors separately.",
      "Build the two divider branches; connect the voltmeter between their midpoints and position both movable contacts.",
      "MoveA topwire to setp; slideC lowerwire until meter closest to zero; measureq fromE, not active lowerlength.",
      "Read the instrument beside the apparatus and transcribe the raw observation before changing the trial."
    ],
    "measurementTargets": [
      {
        "label": "p, q",
        "unit": "m",
        "instrument": "ruler"
      },
      {
        "label": "Null voltage",
        "unit": "V",
        "instrument": "voltmeter"
      }
    ],
    "cautions": [
      "Adapted/generated teaching apparatus; not official Cambridge software.",
      "q is measured from the specified end, not the active lower-wire length; do not auto-snap the contact to null.",
      "Idealised adapted model; source alignment does not establish physical apparatus calibration."
    ],
    "provisional": false
  },
  "9702_w21_34-q2": {
    "title": "Oscillations of a suspended rod",
    "family": "suspended_rod_two_modes",
    "category": "oscillation",
    "parts": [
      {
        "id": "stand",
        "label": "Suspension stand",
        "kind": "stand",
        "x": 130,
        "y": 320,
        "purpose": "Hold the common suspension pin."
      },
      {
        "id": "pin",
        "label": "Pin and cork",
        "kind": "peg",
        "x": 355,
        "y": 120,
        "purpose": "Provide the common upper attachment.",
        "requires": [
          "stand"
        ]
      },
      {
        "id": "string-left",
        "label": "Left suspension string",
        "kind": "string",
        "x": 265,
        "y": 250,
        "purpose": "Keep length equal to the right string.",
        "requires": [
          "pin"
        ]
      },
      {
        "id": "string-right",
        "label": "Right suspension string",
        "kind": "string",
        "x": 460,
        "y": 250,
        "purpose": "Suspend the other rod end.",
        "requires": [
          "pin"
        ]
      },
      {
        "id": "rod",
        "label": "Wooden rod",
        "kind": "rod",
        "x": 360,
        "y": 385,
        "purpose": "Support rocking and parallel-motion modes.",
        "requires": [
          "string-left",
          "string-right"
        ]
      },
      {
        "id": "mass",
        "label": "Slotted load",
        "kind": "mass",
        "x": 360,
        "y": 445,
        "purpose": "Attach at the specified source position.",
        "requires": [
          "rod"
        ]
      },
      {
        "id": "ruler",
        "label": "Metre rule",
        "kind": "ruler",
        "x": 820,
        "y": 130,
        "purpose": "Measure from the selected physical endpoints, with the scale aligned to the apparatus."
      },
      {
        "id": "protractor",
        "label": "Protractor",
        "kind": "protractor",
        "x": 820,
        "y": 280,
        "purpose": "Align the centre and reference axis before reading the angle."
      },
      {
        "id": "stopwatch",
        "label": "Manual stopwatch",
        "kind": "stopwatch",
        "x": 820,
        "y": 470,
        "purpose": "Start and stop manually at observed events; read elapsed physical time, not the model period."
      }
    ],
    "connections": [
      {
        "to": "pin:mount",
        "label": "Fix pin",
        "from": "stand:boss"
      },
      {
        "to": "string-left:top",
        "label": "Left suspension",
        "from": "pin:tip"
      },
      {
        "to": "string-right:top",
        "label": "Right suspension",
        "from": "pin:tip"
      },
      {
        "to": "rod:left",
        "label": "Attach left end",
        "from": "string-left:bottom"
      },
      {
        "to": "rod:right",
        "label": "Attach right end",
        "from": "string-right:bottom"
      },
      {
        "to": "mass:hook",
        "label": "Attach load",
        "from": "rod:load-point"
      }
    ],
    "steps": [
      "Place support and pin; attach the two equal strings separately.",
      "Attach and level the rod, add the specified load and align the measuring instruments.",
      "Tie strings equally to pin, levelrod; release distinct mode; count/time, shorten strings and repeat.",
      "Read the instrument beside the apparatus and transcribe the raw observation before changing the trial."
    ],
    "measurementTargets": [
      {
        "label": "y",
        "unit": "m",
        "instrument": "ruler"
      },
      {
        "label": "theta",
        "unit": "degree",
        "instrument": "protractor"
      },
      {
        "label": "Elapsed time in each selected mode",
        "unit": "s",
        "instrument": "stopwatch"
      }
    ],
    "cautions": [
      "Adapted/generated teaching apparatus; not official Cambridge software.",
      "Rocking and parallel translation require different displacements; mixed modes are not a clean trial.",
      "Idealised adapted model; source alignment does not establish physical apparatus calibration."
    ],
    "provisional": false
  },
  "9702_w22_33-q1": {
    "title": "Resistivity of a metal",
    "family": "folded_wire_series_resistivity",
    "category": "circuit",
    "parts": [
      {
        "id": "cell",
        "label": "DC supply",
        "kind": "cell",
        "x": 130,
        "y": 170,
        "purpose": "Supply the circuit through its positive and negative terminals."
      },
      {
        "id": "switch",
        "label": "Switch",
        "kind": "switch",
        "x": 300,
        "y": 130,
        "purpose": "Keep open while rewiring; closing cannot repair missing or incorrect connections."
      },
      {
        "id": "wire",
        "label": "Folded nichrome wire",
        "kind": "wire",
        "x": 370,
        "y": 345,
        "purpose": "Provide the folded active path.",
        "rotation": 90
      },
      {
        "id": "clip",
        "label": "Movable contact Q",
        "kind": "clamp",
        "x": 565,
        "y": 300,
        "purpose": "Remove one measured length x from the active path."
      },
      {
        "id": "resistor",
        "label": "Fixed resistor",
        "kind": "resistor",
        "x": 500,
        "y": 150,
        "purpose": "Carry the measured voltage drop."
      },
      {
        "id": "ruler",
        "label": "Metre rule",
        "kind": "ruler",
        "x": 820,
        "y": 130,
        "purpose": "Measure from the selected physical endpoints, with the scale aligned to the apparatus."
      },
      {
        "id": "micrometer",
        "label": "Micrometer",
        "kind": "micrometer",
        "x": 820,
        "y": 240,
        "purpose": "Check zero and close gently on the wire or rubber; read without squeezing."
      },
      {
        "id": "voltmeter",
        "label": "Voltmeter",
        "kind": "voltmeter",
        "x": 820,
        "y": 440,
        "purpose": "Connect both leads across the specified component; observe voltage including polarity."
      }
    ],
    "connections": [
      {
        "to": "switch:a",
        "label": "Supply",
        "from": "cell:plus"
      },
      {
        "to": "resistor:a",
        "label": "Fixed resistor input",
        "from": "switch:b"
      },
      {
        "to": "wire:a",
        "label": "Folded wire input",
        "from": "resistor:b"
      },
      {
        "to": "clip:jaw",
        "label": "Movable wire contact",
        "from": "wire:slider"
      },
      {
        "to": "cell:minus",
        "label": "Return",
        "from": "clip:lead"
      },
      {
        "to": "resistor:a",
        "label": "Across fixed resistor positive",
        "from": "voltmeter:plus"
      },
      {
        "to": "resistor:b",
        "label": "Across fixed resistor negative",
        "from": "voltmeter:minus"
      }
    ],
    "steps": [
      "Place the folded wire and resistor; measure wire diameter without powering the circuit.",
      "Measure supply voltage first, then build the series circuit and reconnect the voltmeter across the fixed resistor.",
      "Measure open-circuit voltage E; moveQ along topwire, close/read across22ohm/open; micrometer diameter.",
      "Read the instrument beside the apparatus and transcribe the raw observation before changing the trial."
    ],
    "measurementTargets": [
      {
        "label": "x",
        "unit": "m",
        "instrument": "ruler"
      },
      {
        "label": "E, V",
        "unit": "V",
        "instrument": "voltmeter"
      },
      {
        "label": "Wire diameter d",
        "unit": "m",
        "instrument": "micrometer"
      }
    ],
    "cautions": [
      "Adapted/generated teaching apparatus; not official Cambridge software.",
      "Moving Q removes x, not 2x; final V is across the fixed resistor.",
      "Idealised adapted model; source alignment does not establish physical apparatus calibration."
    ],
    "provisional": false
  },
  "9702_w22_33-q2": {
    "title": "Extension of two springs",
    "family": "buoyancy_series_springs",
    "category": "mechanics",
    "parts": [
      {
        "id": "stand",
        "label": "Spring support",
        "kind": "stand",
        "x": 130,
        "y": 330,
        "purpose": "Hold the series springs."
      },
      {
        "id": "spring-1",
        "label": "Upper spring",
        "kind": "spring",
        "x": 325,
        "y": 180,
        "purpose": "Extend under the total suspended load.",
        "requires": [
          "stand"
        ]
      },
      {
        "id": "spring-2",
        "label": "Lower spring",
        "kind": "spring",
        "x": 325,
        "y": 305,
        "purpose": "Connect in series, not in parallel.",
        "requires": [
          "spring-1"
        ]
      },
      {
        "id": "load",
        "label": "Steel nut set",
        "kind": "mass",
        "x": 325,
        "y": 425,
        "purpose": "Suspend in air and then fully immerse.",
        "requires": [
          "spring-2"
        ]
      },
      {
        "id": "calibration-mass",
        "label": "Calibration hanger and load",
        "kind": "mass",
        "x": 540,
        "y": 160,
        "purpose": "Use a known labelled load increment before the nut trial.",
        "optional": true
      },
      {
        "id": "beaker",
        "label": "Oil beaker",
        "kind": "beaker",
        "x": 350,
        "y": 490,
        "purpose": "Surround the nut without supporting it."
      },
      {
        "id": "oil",
        "label": "Cooking oil",
        "kind": "oil",
        "x": 555,
        "y": 435,
        "purpose": "Fill the beaker for immersion."
      },
      {
        "id": "ruler",
        "label": "Metre rule",
        "kind": "ruler",
        "x": 820,
        "y": 130,
        "purpose": "Measure from the selected physical endpoints, with the scale aligned to the apparatus."
      },
      {
        "id": "balance",
        "label": "Digital balance",
        "kind": "balance",
        "x": 820,
        "y": 340,
        "purpose": "Zero the pan and place the actual measured object on it; read mass."
      },
      {
        "id": "stopwatch",
        "label": "Manual stopwatch",
        "kind": "stopwatch",
        "x": 820,
        "y": 470,
        "purpose": "Start and stop manually at observed events; read elapsed physical time, not the model period.",
        "optional": true
      }
    ],
    "connections": [
      {
        "to": "spring-1:top",
        "label": "Hang upper spring",
        "from": "stand:hook"
      },
      {
        "to": "spring-2:top",
        "label": "Series connection",
        "from": "spring-1:bottom"
      },
      {
        "to": "load:hook",
        "label": "Hang nut set",
        "from": "spring-2:bottom"
      }
    ],
    "steps": [
      "Place the stand and connect the springs end-to-end; calibrate with the labelled load increment.",
      "Weigh the nut set, suspend it in air, and place the oil beaker beneath without touching the load.",
      "Calibrate with100g increment; weigh nutset, suspend, settle and read; immerse clear of the bottom and read.",
      "Read the instrument beside the apparatus and transcribe the raw observation before changing the trial."
    ],
    "measurementTargets": [
      {
        "label": "L1, L2, Lair, Loil",
        "unit": "m",
        "instrument": "ruler"
      },
      {
        "label": "Nut-set mass M",
        "unit": "kg",
        "instrument": "balance"
      }
    ],
    "cautions": [
      "Adapted/generated teaching apparatus; not official Cambridge software.",
      "The submerged nut must be fully immersed, bubble-free and clear of the beaker bottom.",
      "Idealised adapted model; source alignment does not establish physical apparatus calibration."
    ],
    "provisional": false
  },
  "9702_w22_34-q1": {
    "title": "Stability of a cylinder",
    "family": "cylinder_step_stability",
    "category": "mechanics",
    "parts": [
      {
        "id": "board",
        "label": "Tilting board",
        "kind": "board",
        "x": 355,
        "y": 380,
        "purpose": "Raise slowly about the low end."
      },
      {
        "id": "bottle",
        "label": "Full cylindrical drinks bottle",
        "kind": "bottle",
        "x": 375,
        "y": 275,
        "purpose": "Roll over the paper step at threshold."
      },
      {
        "id": "paper",
        "label": "Counted paper shims",
        "kind": "card",
        "x": 485,
        "y": 350,
        "purpose": "Form the measured sharp step."
      },
      {
        "id": "support",
        "label": "Adjustable board support",
        "kind": "board",
        "x": 185,
        "y": 465,
        "purpose": "Raise the board without impulsive motion."
      },
      {
        "id": "ruler",
        "label": "Metre rule",
        "kind": "ruler",
        "x": 820,
        "y": 130,
        "purpose": "Measure from the selected physical endpoints, with the scale aligned to the apparatus."
      },
      {
        "id": "caliper",
        "label": "Vernier calipers",
        "kind": "caliper",
        "x": 820,
        "y": 280,
        "purpose": "Select inside or outside jaws and read the actual diameter or thickness."
      },
      {
        "id": "stopwatch",
        "label": "Manual stopwatch",
        "kind": "stopwatch",
        "x": 820,
        "y": 470,
        "purpose": "Start and stop manually at observed events; read elapsed physical time, not the model period.",
        "optional": true
      }
    ],
    "connections": [
      {
        "to": "board:underside",
        "label": "Support raised end",
        "from": "support:top"
      },
      {
        "to": "board:surface",
        "label": "Place paper step",
        "from": "paper:base"
      },
      {
        "to": "board:surface",
        "label": "Place cylinder",
        "from": "bottle:contact"
      }
    ],
    "steps": [
      "Place board and adjustable support; count and stack the paper shims.",
      "Measure stack thickness, seat the full bottle behind the step and align the height ruler.",
      "Count/stack paper, caliper thickness, slowly raise board and readheight atroll onset.",
      "Read the instrument beside the apparatus and transcribe the raw observation before changing the trial."
    ],
    "measurementTargets": [
      {
        "label": "Shim thickness T",
        "unit": "m",
        "instrument": "caliper"
      },
      {
        "label": "w, z",
        "unit": "m",
        "instrument": "ruler"
      }
    ],
    "cautions": [
      "Adapted/generated teaching apparatus; not official Cambridge software.",
      "Raise quasistatically and observe first rolling; do not push the bottle or confuse sliding with tipping.",
      "Idealised adapted model; source alignment does not establish physical apparatus calibration."
    ],
    "provisional": false
  },
  "9702_w22_34-q2": {
    "title": "Force acting on a magnet",
    "family": "magnet_coil_cantilever",
    "category": "circuit",
    "parts": [
      {
        "id": "stand",
        "label": "Cantilever support",
        "kind": "stand",
        "x": 100,
        "y": 340,
        "purpose": "Clamp the prepared bending spring."
      },
      {
        "id": "spring",
        "label": "Prepared spring cantilever / pointer",
        "kind": "spring",
        "x": 310,
        "y": 185,
        "purpose": "Deflect vertically under magnet and coil force.",
        "requires": [
          "stand"
        ]
      },
      {
        "id": "magnet",
        "label": "Neodymium magnet",
        "kind": "magnet",
        "x": 470,
        "y": 210,
        "purpose": "Attach at the cantilever free end.",
        "requires": [
          "spring"
        ]
      },
      {
        "id": "coil",
        "label": "Electromagnet coil",
        "kind": "coil",
        "x": 465,
        "y": 380,
        "purpose": "Position close to the magnet without contact."
      },
      {
        "id": "cell",
        "label": "DC supply",
        "kind": "cell",
        "x": 130,
        "y": 170,
        "purpose": "Supply the circuit through its positive and negative terminals."
      },
      {
        "id": "switch",
        "label": "Switch",
        "kind": "switch",
        "x": 300,
        "y": 130,
        "purpose": "Keep open while rewiring; closing cannot repair missing or incorrect connections."
      },
      {
        "id": "rheostat",
        "label": "Variable resistor",
        "kind": "resistor",
        "x": 250,
        "y": 460,
        "purpose": "Set current while observing the ammeter."
      },
      {
        "id": "ruler",
        "label": "Metre rule",
        "kind": "ruler",
        "x": 820,
        "y": 130,
        "purpose": "Measure from the selected physical endpoints, with the scale aligned to the apparatus."
      },
      {
        "id": "ammeter",
        "label": "Ammeter",
        "kind": "ammeter",
        "x": 820,
        "y": 340,
        "purpose": "Insert in series; read current only after a complete powered circuit is assembled."
      }
    ],
    "connections": [
      {
        "to": "spring:fixed-end",
        "label": "Clamp cantilever",
        "from": "stand:jaw"
      },
      {
        "to": "magnet:attachment",
        "label": "Attach magnet",
        "from": "spring:tip"
      },
      {
        "to": "switch:a",
        "label": "Supply",
        "from": "cell:plus"
      },
      {
        "to": "rheostat:a",
        "label": "Current control",
        "from": "switch:b"
      },
      {
        "to": "coil:a",
        "label": "Coil input",
        "from": "rheostat:wiper"
      },
      {
        "to": "ammeter:plus",
        "label": "Series meter",
        "from": "coil:b"
      },
      {
        "to": "cell:minus",
        "label": "Return",
        "from": "ammeter:minus"
      }
    ],
    "steps": [
      "Clamp the prepared spring, attach the magnet and measure its weight deflection.",
      "Place the coil separately without contact, then wire supply, switch, rheostat and ammeter in series.",
      "Attach magnet, read weight deflection, position coil, setrheostat/current, observe pointer and readH after settling.",
      "Read the instrument beside the apparatus and transcribe the raw observation before changing the trial."
    ],
    "measurementTargets": [
      {
        "label": "h0, h, H",
        "unit": "m",
        "instrument": "ruler"
      },
      {
        "label": "Current I",
        "unit": "A",
        "instrument": "ammeter"
      },
      {
        "label": "Magnet mass label",
        "unit": "kg",
        "instrument": "magnet"
      }
    ],
    "cautions": [
      "Adapted/generated teaching apparatus; not official Cambridge software.",
      "The prepared cantilever is not a pristine extension spring; both beam response and magnetic force remain provisional.",
      "PROVISIONAL SYNTHETIC ADAPTATION — NOT VALIDATED APPARATUS. This source-checked workflow uses uncalibrated synthetic behaviour. It must not be described as physically calibrated, apparatus-faithful, or completed until real-apparatus validation is recorded."
    ],
    "provisional": true
  },
  "9702_w23_33-q1": {
    "title": "Oscillations of a pendulum",
    "family": "interrupted_pendulum",
    "category": "oscillation",
    "parts": [
      {
        "id": "stand",
        "label": "Pendulum stand",
        "kind": "stand",
        "x": 130,
        "y": 330,
        "purpose": "Carry fixed suspension and adjustable obstruction."
      },
      {
        "id": "clamp",
        "label": "Top suspension clamp",
        "kind": "clamp",
        "x": 355,
        "y": 115,
        "purpose": "Keep the total length fixed.",
        "requires": [
          "stand"
        ]
      },
      {
        "id": "peg",
        "label": "Wooden obstruction rod",
        "kind": "rod",
        "x": 385,
        "y": 290,
        "purpose": "Change the interruption height S.",
        "requires": [
          "stand"
        ]
      },
      {
        "id": "string",
        "label": "Pendulum string",
        "kind": "string",
        "x": 385,
        "y": 315,
        "purpose": "Contact the obstruction during one side of the swing.",
        "requires": [
          "clamp"
        ]
      },
      {
        "id": "bob",
        "label": "Pendulum bob",
        "kind": "bob",
        "x": 385,
        "y": 475,
        "purpose": "Execute both arcs of each full cycle.",
        "requires": [
          "string"
        ]
      },
      {
        "id": "ruler",
        "label": "Metre rule",
        "kind": "ruler",
        "x": 820,
        "y": 130,
        "purpose": "Measure from the selected physical endpoints, with the scale aligned to the apparatus."
      },
      {
        "id": "protractor",
        "label": "Protractor",
        "kind": "protractor",
        "x": 820,
        "y": 280,
        "purpose": "Align the centre and reference axis before reading the angle."
      },
      {
        "id": "stopwatch",
        "label": "Manual stopwatch",
        "kind": "stopwatch",
        "x": 820,
        "y": 470,
        "purpose": "Start and stop manually at observed events; read elapsed physical time, not the model period."
      }
    ],
    "connections": [
      {
        "to": "clamp:mount",
        "label": "Fix suspension",
        "from": "stand:upper-boss"
      },
      {
        "to": "string:top",
        "label": "Suspend string",
        "from": "clamp:hook"
      },
      {
        "to": "bob:hook",
        "label": "Attach bob",
        "from": "string:bottom"
      },
      {
        "to": "peg:mount",
        "label": "Place obstruction",
        "from": "stand:lower-boss"
      }
    ],
    "steps": [
      "Place the stand, clamp, string and bob; measure and fix total length L.",
      "Attach the obstruction rod at the chosen S and check that it lies in the swing plane.",
      "Keep L fixed; adjust obstruction height S; release away from rod, count full asymmetric cycles.",
      "Read the instrument beside the apparatus and transcribe the raw observation before changing the trial."
    ],
    "measurementTargets": [
      {
        "label": "L, S",
        "unit": "m",
        "instrument": "ruler"
      },
      {
        "label": "Release angle",
        "unit": "degree",
        "instrument": "protractor"
      },
      {
        "label": "Elapsed full-cycle time",
        "unit": "s",
        "instrument": "stopwatch"
      }
    ],
    "cautions": [
      "Adapted/generated teaching apparatus; not official Cambridge software.",
      "Change S while keeping L fixed; count both unequal arcs as one complete cycle.",
      "Idealised adapted model; source alignment does not establish physical apparatus calibration."
    ],
    "provisional": false
  },
  "9702_w23_33-q2": {
    "title": "Wooden strip resting at an angle",
    "family": "inclined_rod_lift",
    "category": "mechanics",
    "parts": [
      {
        "id": "stand",
        "label": "Upper contact support",
        "kind": "stand",
        "x": 120,
        "y": 320,
        "purpose": "Provide the upper rod contact."
      },
      {
        "id": "pivot",
        "label": "Lower pivot",
        "kind": "peg",
        "x": 235,
        "y": 440,
        "purpose": "Fix the lower contact position."
      },
      {
        "id": "rod",
        "label": "Inclined wooden strip",
        "kind": "rod",
        "x": 375,
        "y": 340,
        "purpose": "Lift clear of the upper support at threshold.",
        "requires": [
          "pivot"
        ]
      },
      {
        "id": "mass",
        "label": "Slotted load",
        "kind": "mass",
        "x": 390,
        "y": 290,
        "purpose": "Move to the selected position d.",
        "requires": [
          "rod"
        ]
      },
      {
        "id": "string",
        "label": "Vertical pulling string",
        "kind": "string",
        "x": 530,
        "y": 250,
        "purpose": "Transmit an upward force at the far end.",
        "requires": [
          "rod"
        ]
      },
      {
        "id": "force-meter",
        "label": "Newton meter",
        "kind": "newton-meter",
        "x": 650,
        "y": 290,
        "purpose": "Pull along the specified line of action and read the spring scale in newtons."
      },
      {
        "id": "ruler",
        "label": "Metre rule",
        "kind": "ruler",
        "x": 820,
        "y": 130,
        "purpose": "Measure from the selected physical endpoints, with the scale aligned to the apparatus."
      },
      {
        "id": "protractor",
        "label": "Protractor",
        "kind": "protractor",
        "x": 820,
        "y": 280,
        "purpose": "Align the centre and reference axis before reading the angle."
      }
    ],
    "connections": [
      {
        "to": "rod:lower-end",
        "label": "Locate lower pivot",
        "from": "pivot:tip"
      },
      {
        "to": "rod:upper-contact",
        "label": "Rest upper contact",
        "from": "stand:contact"
      },
      {
        "to": "mass:hook",
        "label": "Attach load",
        "from": "rod:load-point"
      },
      {
        "to": "string:bottom",
        "label": "Attach pull",
        "from": "rod:far-end"
      },
      {
        "to": "force-meter:hook",
        "label": "Connect newton meter",
        "from": "string:top"
      }
    ],
    "steps": [
      "Place lower pivot and upper support; rest the strip at the specified angle.",
      "Add the load and vertical pulling string, connect the newton meter and measure all lever distances.",
      "Measure rod, place mass, pull vertically with newton meter until rod loses upper contact; repeat.",
      "Read the instrument beside the apparatus and transcribe the raw observation before changing the trial."
    ],
    "measurementTargets": [
      {
        "label": "x, y, z, d",
        "unit": "m",
        "instrument": "ruler"
      },
      {
        "label": "Threshold force F",
        "unit": "N",
        "instrument": "force-meter"
      }
    ],
    "cautions": [
      "Adapted/generated teaching apparatus; not official Cambridge software.",
      "Pull vertically and slowly; read at first loss of upper contact, not after the strip has accelerated.",
      "Idealised adapted model; source alignment does not establish physical apparatus calibration."
    ],
    "provisional": false
  },
  "9702_w23_34-q1": {
    "title": "Null-balance circuit with selectable fixed resistors",
    "family": "meter_bridge_parallel_resistor",
    "category": "circuit",
    "parts": [
      {
        "id": "cell",
        "label": "DC supply",
        "kind": "cell",
        "x": 130,
        "y": 170,
        "purpose": "Supply the circuit through its positive and negative terminals."
      },
      {
        "id": "switch",
        "label": "Switch",
        "kind": "switch",
        "x": 300,
        "y": 130,
        "purpose": "Keep open while rewiring; closing cannot repair missing or incorrect connections."
      },
      {
        "id": "wire",
        "label": "Metre bridge wire",
        "kind": "wire",
        "x": 365,
        "y": 430,
        "purpose": "Provide the two measured segments a and b.",
        "rotation": 90
      },
      {
        "id": "clip",
        "label": "Sliding null contact",
        "kind": "clamp",
        "x": 565,
        "y": 390,
        "purpose": "Move manually until the detector brackets zero."
      },
      {
        "id": "resistor-p",
        "label": "Fixed resistor P",
        "kind": "resistor",
        "x": 285,
        "y": 280,
        "purpose": "Form one fixed bridge arm."
      },
      {
        "id": "resistor-q",
        "label": "Fixed resistor Q",
        "kind": "resistor",
        "x": 465,
        "y": 255,
        "purpose": "Shunt with selectable R."
      },
      {
        "id": "resistor",
        "label": "Selectable resistor R",
        "kind": "resistor",
        "x": 500,
        "y": 345,
        "purpose": "Connect in parallel with Q."
      },
      {
        "id": "ruler",
        "label": "Metre rule",
        "kind": "ruler",
        "x": 820,
        "y": 130,
        "purpose": "Measure from the selected physical endpoints, with the scale aligned to the apparatus."
      },
      {
        "id": "voltmeter",
        "label": "Voltmeter",
        "kind": "voltmeter",
        "x": 820,
        "y": 320,
        "purpose": "Connect both leads across the specified component; observe voltage including polarity."
      }
    ],
    "connections": [
      {
        "to": "switch:a",
        "label": "Supply",
        "from": "cell:plus"
      },
      {
        "to": "wire:a",
        "label": "Wire feed",
        "from": "switch:b"
      },
      {
        "to": "cell:minus",
        "label": "Wire return",
        "from": "wire:b"
      },
      {
        "to": "resistor-q:a",
        "label": "Parallel arm feed",
        "from": "switch:b"
      },
      {
        "to": "resistor:a",
        "label": "Parallel R input",
        "from": "resistor-q:a"
      },
      {
        "to": "resistor:b",
        "label": "Parallel R output",
        "from": "resistor-q:b"
      },
      {
        "to": "resistor-p:a",
        "label": "Fixed-arm junction",
        "from": "resistor-q:b"
      },
      {
        "to": "cell:minus",
        "label": "Fixed-arm return",
        "from": "resistor-p:b"
      },
      {
        "to": "wire:slider",
        "label": "Jockey contact",
        "from": "clip:jaw"
      },
      {
        "to": "resistor-p:a",
        "label": "Fixed midpoint detector",
        "from": "voltmeter:plus"
      },
      {
        "to": "clip:lead",
        "label": "Wire midpoint detector",
        "from": "voltmeter:minus"
      }
    ],
    "steps": [
      "Place P, Q and selectable R separately and join R in parallel with Q.",
      "Build both bridge branches and connect the voltmeter between the sliding wire contact and fixed-arm junction.",
      "Insert R parallel to Q; slide wire contact until null, measure both segments, changeR.",
      "Read the instrument beside the apparatus and transcribe the raw observation before changing the trial."
    ],
    "measurementTargets": [
      {
        "label": "a, b",
        "unit": "m",
        "instrument": "ruler"
      },
      {
        "label": "Null voltage",
        "unit": "V",
        "instrument": "voltmeter"
      }
    ],
    "cautions": [
      "Adapted/generated teaching apparatus; not official Cambridge software.",
      "Find null by measurement without automatic centring; measure both segments from the actual wire endpoints.",
      "Idealised adapted model; source alignment does not establish physical apparatus calibration."
    ],
    "provisional": false
  },
  "9702_w23_34-q2": {
    "title": "Path of a jet of water",
    "family": "water_jet_ballistics",
    "category": "flow",
    "parts": [
      {
        "id": "stand",
        "label": "Bottle height stand",
        "kind": "stand",
        "x": 125,
        "y": 340,
        "purpose": "Set the bottle height above the tray."
      },
      {
        "id": "bottle",
        "label": "Pierced water bottle",
        "kind": "bottle",
        "x": 285,
        "y": 250,
        "purpose": "Emit a horizontal jet from the side hole.",
        "requires": [
          "stand"
        ]
      },
      {
        "id": "water",
        "label": "Water jug",
        "kind": "water",
        "x": 130,
        "y": 140,
        "purpose": "Refill before each jet observation."
      },
      {
        "id": "funnel",
        "label": "Filling funnel",
        "kind": "tube",
        "x": 405,
        "y": 130,
        "purpose": "Guide water into the bottle."
      },
      {
        "id": "rod",
        "label": "Jet target rod",
        "kind": "rod",
        "x": 550,
        "y": 435,
        "purpose": "Set the horizontal target location."
      },
      {
        "id": "tray",
        "label": "Water collection tray",
        "kind": "tray",
        "x": 415,
        "y": 505,
        "purpose": "Collect the jet."
      },
      {
        "id": "ruler",
        "label": "Metre rule",
        "kind": "ruler",
        "x": 820,
        "y": 130,
        "purpose": "Measure from the selected physical endpoints, with the scale aligned to the apparatus."
      },
      {
        "id": "height-ruler",
        "label": "Vertical head rule",
        "kind": "ruler",
        "x": 710,
        "y": 340,
        "purpose": "Observe water level and vertical distances."
      },
      {
        "id": "stopwatch",
        "label": "Manual stopwatch",
        "kind": "stopwatch",
        "x": 820,
        "y": 470,
        "purpose": "Start and stop manually at observed events; read elapsed physical time, not the model period.",
        "optional": true
      }
    ],
    "connections": [
      {
        "to": "bottle:base",
        "label": "Support bottle",
        "from": "stand:platform"
      },
      {
        "to": "bottle:mouth",
        "label": "Fit funnel",
        "from": "funnel:outlet"
      },
      {
        "to": "tray:floor",
        "label": "Set target rod",
        "from": "rod:base"
      }
    ],
    "steps": [
      "Place bottle stand, pierced bottle and collecting tray.",
      "Place the target rod and both rulers; measure geometry before filling through the funnel.",
      "Measure three geometric distances, fill, mark water level when jet touches rod; raise bottle, repeat.",
      "Read the instrument beside the apparatus and transcribe the raw observation before changing the trial."
    ],
    "measurementTargets": [
      {
        "label": "Horizontal distances A, B",
        "unit": "m",
        "instrument": "ruler"
      },
      {
        "label": "Vertical distances C, h",
        "unit": "m",
        "instrument": "height-ruler"
      }
    ],
    "cautions": [
      "Adapted/generated teaching apparatus; not official Cambridge software.",
      "Observe the falling water level when the jet touches the rod; a changing head must shorten the visible trajectory.",
      "Idealised adapted model; source alignment does not establish physical apparatus calibration."
    ],
    "provisional": false
  },
  "9702_w24_33-q1": {
    "title": "Resistivity of a metal",
    "family": "wire_voltage_divider_resistivity",
    "category": "circuit",
    "parts": [
      {
        "id": "cell",
        "label": "DC supply",
        "kind": "cell",
        "x": 130,
        "y": 170,
        "purpose": "Supply the circuit through its positive and negative terminals."
      },
      {
        "id": "switch",
        "label": "Switch",
        "kind": "switch",
        "x": 300,
        "y": 130,
        "purpose": "Keep open while rewiring; closing cannot repair missing or incorrect connections."
      },
      {
        "id": "resistor",
        "label": "Fixed series resistor",
        "kind": "resistor",
        "x": 470,
        "y": 150,
        "purpose": "Remain in series with the selected wire length."
      },
      {
        "id": "wire",
        "label": "Nichrome resistance wire",
        "kind": "wire",
        "x": 350,
        "y": 350,
        "purpose": "Provide the voltage-measured active section.",
        "rotation": 90
      },
      {
        "id": "clip",
        "label": "Movable contact F",
        "kind": "clamp",
        "x": 565,
        "y": 310,
        "purpose": "Set the active length L."
      },
      {
        "id": "ruler",
        "label": "Metre rule",
        "kind": "ruler",
        "x": 820,
        "y": 130,
        "purpose": "Measure from the selected physical endpoints, with the scale aligned to the apparatus."
      },
      {
        "id": "micrometer",
        "label": "Micrometer",
        "kind": "micrometer",
        "x": 820,
        "y": 240,
        "purpose": "Check zero and close gently on the wire or rubber; read without squeezing."
      },
      {
        "id": "voltmeter",
        "label": "Voltmeter",
        "kind": "voltmeter",
        "x": 820,
        "y": 440,
        "purpose": "Connect both leads across the specified component; observe voltage including polarity."
      }
    ],
    "connections": [
      {
        "to": "switch:a",
        "label": "Supply",
        "from": "cell:plus"
      },
      {
        "to": "resistor:a",
        "label": "Series resistor",
        "from": "switch:b"
      },
      {
        "to": "wire:a",
        "label": "Wire feed",
        "from": "resistor:b"
      },
      {
        "to": "clip:jaw",
        "label": "Length contact",
        "from": "wire:slider"
      },
      {
        "to": "cell:minus",
        "label": "Return",
        "from": "clip:lead"
      },
      {
        "to": "wire:a",
        "label": "Across wire positive",
        "from": "voltmeter:plus"
      },
      {
        "to": "clip:lead",
        "label": "Across wire negative",
        "from": "voltmeter:minus"
      }
    ],
    "steps": [
      "Place resistance wire, resistor, supply and switch.",
      "Measure wire diameter, set the contact and connect the voltmeter across the active wire section.",
      "Move clipF to vary activewire; read voltage acrosswire, not fixed resistor; measure diameter.",
      "Read the instrument beside the apparatus and transcribe the raw observation before changing the trial."
    ],
    "measurementTargets": [
      {
        "label": "L",
        "unit": "m",
        "instrument": "ruler"
      },
      {
        "label": "V across wire",
        "unit": "V",
        "instrument": "voltmeter"
      },
      {
        "label": "Wire diameter d",
        "unit": "m",
        "instrument": "micrometer"
      }
    ],
    "cautions": [
      "Adapted/generated teaching apparatus; not official Cambridge software.",
      "Unlike the folded-wire experiment, V is across the wire, not the fixed resistor; open the switch before moving F.",
      "Idealised adapted model; source alignment does not establish physical apparatus calibration."
    ],
    "provisional": false
  },
  "9702_w24_33-q2": {
    "title": "Movement of a ball",
    "family": "colliding_pendulum_balls",
    "category": "oscillation",
    "parts": [
      {
        "id": "stand",
        "label": "Collision support stand",
        "kind": "stand",
        "x": 115,
        "y": 330,
        "purpose": "Support the ball suspension points."
      },
      {
        "id": "string-a",
        "label": "Striker suspension",
        "kind": "string",
        "x": 270,
        "y": 240,
        "purpose": "Suspend ball A in the collision plane.",
        "requires": [
          "stand"
        ]
      },
      {
        "id": "string-b",
        "label": "Target suspension",
        "kind": "string",
        "x": 455,
        "y": 240,
        "purpose": "Suspend ball B at matching collision height.",
        "requires": [
          "stand"
        ]
      },
      {
        "id": "ball-a",
        "label": "Striker ball A",
        "kind": "ball",
        "x": 275,
        "y": 380,
        "purpose": "Release from the chosen block height.",
        "requires": [
          "string-a"
        ]
      },
      {
        "id": "ball-b",
        "label": "Target ball B",
        "kind": "ball",
        "x": 455,
        "y": 380,
        "purpose": "Swing to a first peak after impact.",
        "requires": [
          "string-b"
        ]
      },
      {
        "id": "block",
        "label": "Release-height obstacle",
        "kind": "board",
        "x": 180,
        "y": 460,
        "purpose": "Set a repeatable striker release position."
      },
      {
        "id": "mass",
        "label": "Additional striker load",
        "kind": "mass",
        "x": 555,
        "y": 440,
        "purpose": "Attach to A only for the second condition.",
        "requires": [
          "ball-a"
        ],
        "optional": true
      },
      {
        "id": "ruler",
        "label": "Metre rule",
        "kind": "ruler",
        "x": 820,
        "y": 130,
        "purpose": "Measure from the selected physical endpoints, with the scale aligned to the apparatus."
      },
      {
        "id": "balance",
        "label": "Digital balance",
        "kind": "balance",
        "x": 820,
        "y": 340,
        "purpose": "Zero the pan and place the actual measured object on it; read mass."
      },
      {
        "id": "stopwatch",
        "label": "Manual stopwatch",
        "kind": "stopwatch",
        "x": 820,
        "y": 470,
        "purpose": "Start and stop manually at observed events; read elapsed physical time, not the model period.",
        "optional": true
      }
    ],
    "connections": [
      {
        "to": "string-a:top",
        "label": "Hang striker string",
        "from": "stand:left-hook"
      },
      {
        "to": "string-b:top",
        "label": "Hang target string",
        "from": "stand:right-hook"
      },
      {
        "to": "ball-a:hook",
        "label": "Attach striker",
        "from": "string-a:bottom"
      },
      {
        "to": "ball-b:hook",
        "label": "Attach target",
        "from": "string-b:bottom"
      }
    ],
    "steps": [
      "Place the support and two strings, then attach each ball separately.",
      "Measure ball mass, align centres for a head-on collision and place the release-height block and ruler.",
      "Release A from blockheight, observeB peak using ruler, repeat with10g onA.",
      "Read the instrument beside the apparatus and transcribe the raw observation before changing the trial."
    ],
    "measurementTargets": [
      {
        "label": "Ball mass m",
        "unit": "kg",
        "instrument": "balance"
      },
      {
        "label": "b, d, H",
        "unit": "m",
        "instrument": "ruler"
      }
    ],
    "cautions": [
      "Adapted/generated teaching apparatus; not official Cambridge software.",
      "Read B at its first peak; add the load to A only between trials and avoid off-centre impact.",
      "Idealised adapted model; source alignment does not establish physical apparatus calibration."
    ],
    "provisional": false
  },
  "9702_w24_34-q1": {
    "title": "Flow of water through a nozzle",
    "family": "syringe_nozzle_drainage",
    "category": "flow",
    "parts": [
      {
        "id": "stand",
        "label": "Syringe support stand",
        "kind": "stand",
        "x": 120,
        "y": 330,
        "purpose": "Hold the syringe vertical."
      },
      {
        "id": "clamp",
        "label": "Syringe clamp",
        "kind": "clamp",
        "x": 290,
        "y": 150,
        "purpose": "Grip the barrel without obstructing its graduations.",
        "requires": [
          "stand"
        ]
      },
      {
        "id": "syringe",
        "label": "Graduated drainage syringe",
        "kind": "syringe",
        "x": 340,
        "y": 290,
        "purpose": "Expose the moving meniscus and selected marks.",
        "requires": [
          "clamp"
        ]
      },
      {
        "id": "nozzle",
        "label": "Drainage nozzle",
        "kind": "tube",
        "x": 340,
        "y": 420,
        "purpose": "Attach to the syringe outlet.",
        "requires": [
          "syringe"
        ]
      },
      {
        "id": "water",
        "label": "Water",
        "kind": "water",
        "x": 520,
        "y": 160,
        "purpose": "Fill above the upper timing mark."
      },
      {
        "id": "beaker",
        "label": "Receiving beaker",
        "kind": "beaker",
        "x": 340,
        "y": 480,
        "purpose": "Catch the outflow."
      },
      {
        "id": "ruler",
        "label": "Metre rule",
        "kind": "ruler",
        "x": 820,
        "y": 130,
        "purpose": "Measure from the selected physical endpoints, with the scale aligned to the apparatus."
      },
      {
        "id": "stopwatch",
        "label": "Manual stopwatch",
        "kind": "stopwatch",
        "x": 820,
        "y": 470,
        "purpose": "Start and stop manually at observed events; read elapsed physical time, not the model period."
      }
    ],
    "connections": [
      {
        "to": "clamp:mount",
        "label": "Fix clamp",
        "from": "stand:boss"
      },
      {
        "to": "syringe:barrel",
        "label": "Clamp syringe",
        "from": "clamp:jaw"
      },
      {
        "to": "nozzle:inlet",
        "label": "Fit nozzle",
        "from": "syringe:outlet"
      },
      {
        "to": "beaker:mouth",
        "label": "Collect discharge",
        "from": "nozzle:outlet"
      }
    ],
    "steps": [
      "Place stand, clamp and syringe; attach the nozzle separately and place the receiving beaker.",
      "Align the ruler, choose two graduations, block the outlet and fill above the upper mark.",
      "Fill syringe, manually start/stop at chosenmarks while observing falling meniscus; repeat/change interval.",
      "Read the instrument beside the apparatus and transcribe the raw observation before changing the trial."
    ],
    "measurementTargets": [
      {
        "label": "ht, hb, hm",
        "unit": "m",
        "instrument": "ruler"
      },
      {
        "label": "Selected volume marks",
        "unit": "cm3",
        "instrument": "syringe"
      },
      {
        "label": "Drainage time T",
        "unit": "s",
        "instrument": "stopwatch"
      }
    ],
    "cautions": [
      "Adapted/generated teaching apparatus; not official Cambridge software.",
      "Start and stop manually at meniscus crossings. Nozzle-flow calibration is provisional.",
      "PROVISIONAL SYNTHETIC ADAPTATION — NOT VALIDATED APPARATUS. This source-checked workflow uses uncalibrated synthetic behaviour. It must not be described as physically calibrated, apparatus-faithful, or completed until real-apparatus validation is recorded."
    ],
    "provisional": true
  },
  "9702_w24_34-q2": {
    "title": "Conservation of momentum",
    "family": "magnetic_inelastic_pickup",
    "category": "mechanics",
    "parts": [
      {
        "id": "stand",
        "label": "Pendulum pivot support",
        "kind": "stand",
        "x": 120,
        "y": 330,
        "purpose": "Keep the rod pivot fixed."
      },
      {
        "id": "pivot",
        "label": "Rod pivot",
        "kind": "peg",
        "x": 340,
        "y": 140,
        "purpose": "Allow the loaded rod to swing.",
        "requires": [
          "stand"
        ]
      },
      {
        "id": "rod",
        "label": "Pivoted wooden rod",
        "kind": "rod",
        "x": 340,
        "y": 305,
        "purpose": "Carry the magnet and contribute rotational inertia.",
        "requires": [
          "pivot"
        ]
      },
      {
        "id": "magnet",
        "label": "Bar magnet",
        "kind": "magnet",
        "x": 340,
        "y": 455,
        "purpose": "Capture the selected nut at the bottom of the swing.",
        "requires": [
          "rod"
        ]
      },
      {
        "id": "nut",
        "label": "First steel nut",
        "kind": "mass",
        "x": 470,
        "y": 455,
        "purpose": "Place in the capture path."
      },
      {
        "id": "nut-spare",
        "label": "Heavier steel nut",
        "kind": "mass",
        "x": 590,
        "y": 455,
        "purpose": "Exchange between trials.",
        "optional": true
      },
      {
        "id": "putty",
        "label": "Magnet fixing putty",
        "kind": "rubber",
        "x": 560,
        "y": 160,
        "purpose": "Secure the magnet to the rod.",
        "requires": [
          "rod"
        ]
      },
      {
        "id": "ruler",
        "label": "Metre rule",
        "kind": "ruler",
        "x": 820,
        "y": 130,
        "purpose": "Measure from the selected physical endpoints, with the scale aligned to the apparatus."
      },
      {
        "id": "stopwatch",
        "label": "Manual stopwatch",
        "kind": "stopwatch",
        "x": 820,
        "y": 470,
        "purpose": "Start and stop manually at observed events; read elapsed physical time, not the model period.",
        "optional": true
      }
    ],
    "connections": [
      {
        "to": "pivot:mount",
        "label": "Fix pivot",
        "from": "stand:boss"
      },
      {
        "to": "rod:pivot",
        "label": "Hang rod",
        "from": "pivot:tip"
      },
      {
        "to": "putty:face",
        "label": "Apply fixing",
        "from": "rod:tip"
      },
      {
        "to": "magnet:back",
        "label": "Attach magnet",
        "from": "putty:outer"
      }
    ],
    "steps": [
      "Place support, pivot and rod, then secure the magnet with putty.",
      "Place the first nut at the lowest magnet path and align the ruler with the release and return marks.",
      "Release from15cmmarker, magnetic capture sticksnut, observe return turning point, repeat with heavier nut.",
      "Read the instrument beside the apparatus and transcribe the raw observation before changing the trial."
    ],
    "measurementTargets": [
      {
        "label": "r, x",
        "unit": "m",
        "instrument": "ruler"
      },
      {
        "label": "Magnet assembly mass label M",
        "unit": "kg",
        "instrument": "magnet"
      },
      {
        "label": "Nut mass label m",
        "unit": "kg",
        "instrument": "nut"
      }
    ],
    "cautions": [
      "Adapted/generated teaching apparatus; not official Cambridge software.",
      "Capture is inelastic: angular momentum, not kinetic energy, is conserved at pickup. Read the first return turning point.",
      "Idealised adapted model; source alignment does not establish physical apparatus calibration."
    ],
    "provisional": false
  },
  "9702_w25_33-q1": {
    "title": "Oscillations of a pendulum on a board",
    "family": "inclined_board_rolling_pendulum",
    "category": "oscillation",
    "parts": [
      {
        "id": "stand",
        "label": "Board support stand",
        "kind": "stand",
        "x": 120,
        "y": 330,
        "purpose": "Set the raised end of the board."
      },
      {
        "id": "clamp",
        "label": "Board support clamp",
        "kind": "clamp",
        "x": 215,
        "y": 270,
        "purpose": "Change board inclination.",
        "requires": [
          "stand"
        ]
      },
      {
        "id": "board",
        "label": "Inclined pendulum board",
        "kind": "board",
        "x": 415,
        "y": 355,
        "purpose": "Provide the surface on which the bob rolls.",
        "requires": [
          "clamp"
        ]
      },
      {
        "id": "peg",
        "label": "Board suspension nail",
        "kind": "peg",
        "x": 310,
        "y": 235,
        "purpose": "Anchor the string on the board.",
        "requires": [
          "board"
        ]
      },
      {
        "id": "string",
        "label": "Pendulum string",
        "kind": "string",
        "x": 435,
        "y": 340,
        "purpose": "Keep the rolling bob at fixed length.",
        "requires": [
          "peg"
        ]
      },
      {
        "id": "bob",
        "label": "Spherical rolling bob",
        "kind": "ball",
        "x": 545,
        "y": 440,
        "purpose": "Roll without slipping along its arc.",
        "requires": [
          "string"
        ]
      },
      {
        "id": "ruler",
        "label": "Metre rule",
        "kind": "ruler",
        "x": 820,
        "y": 130,
        "purpose": "Measure from the selected physical endpoints, with the scale aligned to the apparatus."
      },
      {
        "id": "protractor",
        "label": "Protractor",
        "kind": "protractor",
        "x": 820,
        "y": 280,
        "purpose": "Align the centre and reference axis before reading the angle."
      },
      {
        "id": "stopwatch",
        "label": "Manual stopwatch",
        "kind": "stopwatch",
        "x": 820,
        "y": 470,
        "purpose": "Start and stop manually at observed events; read elapsed physical time, not the model period."
      }
    ],
    "connections": [
      {
        "to": "clamp:mount",
        "label": "Support raised end",
        "from": "stand:boss"
      },
      {
        "to": "board:edge",
        "label": "Grip board",
        "from": "clamp:jaw"
      },
      {
        "to": "peg:mount",
        "label": "Place nail",
        "from": "board:hole"
      },
      {
        "to": "string:top",
        "label": "Attach string",
        "from": "peg:tip"
      },
      {
        "to": "bob:hook",
        "label": "Attach rolling bob",
        "from": "string:bottom"
      }
    ],
    "steps": [
      "Place stand, clamp and board; attach the nail, string and spherical bob separately.",
      "Measure fixed string length and board geometry, then set the raised-end height.",
      "Adjust board incline, keep L fixed, release from side edge and time rolling oscillations; no bob sliding animation.",
      "Read the instrument beside the apparatus and transcribe the raw observation before changing the trial."
    ],
    "measurementTargets": [
      {
        "label": "S, L, h",
        "unit": "m",
        "instrument": "ruler"
      },
      {
        "label": "Board inclination",
        "unit": "degree",
        "instrument": "protractor"
      },
      {
        "label": "Elapsed oscillation time",
        "unit": "s",
        "instrument": "stopwatch"
      }
    ],
    "cautions": [
      "Adapted/generated teaching apparatus; not official Cambridge software.",
      "The bob must roll on the inclined board, not swing freely or slide; keep contact and no-slip assumptions explicit.",
      "Idealised adapted model; source alignment does not establish physical apparatus calibration."
    ],
    "provisional": false
  },
  "9702_w25_33-q2": {
    "title": "Resistance of a light-dependent resistor",
    "family": "led_ldr_photoresistance",
    "category": "circuit",
    "parts": [
      {
        "id": "cell",
        "label": "DC supply",
        "kind": "cell",
        "x": 130,
        "y": 170,
        "purpose": "Supply the circuit through its positive and negative terminals."
      },
      {
        "id": "switch",
        "label": "Switch",
        "kind": "switch",
        "x": 300,
        "y": 130,
        "purpose": "Keep open while rewiring; closing cannot repair missing or incorrect connections."
      },
      {
        "id": "wire",
        "label": "Nichrome current-control wire",
        "kind": "wire",
        "x": 320,
        "y": 310,
        "purpose": "Change active resistance in the LED circuit.",
        "rotation": 90
      },
      {
        "id": "clip",
        "label": "Wire length contact",
        "kind": "clamp",
        "x": 460,
        "y": 270,
        "purpose": "Set measured active wire length."
      },
      {
        "id": "led",
        "label": "Light-emitting diode",
        "kind": "led",
        "x": 485,
        "y": 410,
        "purpose": "Illuminate the separate LDR after electrical connection."
      },
      {
        "id": "ldr",
        "label": "Light-dependent resistor",
        "kind": "ldr",
        "x": 630,
        "y": 410,
        "purpose": "Face the LED at measured separation; remain electrically isolated from its supply."
      },
      {
        "id": "ruler",
        "label": "Metre rule",
        "kind": "ruler",
        "x": 820,
        "y": 130,
        "purpose": "Measure from the selected physical endpoints, with the scale aligned to the apparatus."
      },
      {
        "id": "voltmeter",
        "label": "Voltmeter",
        "kind": "voltmeter",
        "x": 820,
        "y": 270,
        "purpose": "Connect both leads across the specified component; observe voltage including polarity."
      },
      {
        "id": "ohmmeter",
        "label": "Isolated LDR ohmmeter",
        "kind": "ohmmeter",
        "x": 820,
        "y": 425,
        "purpose": "Connect only to the LDR terminals; read resistance after response settles."
      },
      {
        "id": "stopwatch",
        "label": "Manual stopwatch",
        "kind": "stopwatch",
        "x": 640,
        "y": 130,
        "purpose": "Start and stop manually at observed events; read elapsed physical time, not the model period.",
        "optional": true
      }
    ],
    "connections": [
      {
        "to": "switch:a",
        "label": "LED supply",
        "from": "cell:plus"
      },
      {
        "to": "wire:a",
        "label": "Current-control wire",
        "from": "switch:b"
      },
      {
        "to": "clip:jaw",
        "label": "Length contact",
        "from": "wire:slider"
      },
      {
        "to": "led:anode",
        "label": "LED anode feed",
        "from": "clip:lead"
      },
      {
        "to": "cell:minus",
        "label": "LED return",
        "from": "led:cathode"
      },
      {
        "to": "led:anode",
        "label": "LED voltage positive",
        "from": "voltmeter:plus"
      },
      {
        "to": "led:cathode",
        "label": "LED voltage negative",
        "from": "voltmeter:minus"
      },
      {
        "to": "ldr:a",
        "label": "LDR resistance lead",
        "from": "ohmmeter:plus"
      },
      {
        "to": "ldr:b",
        "label": "LDR return lead",
        "from": "ohmmeter:minus"
      }
    ],
    "steps": [
      "Place LED and LDR facing each other and measure their separation.",
      "Build the powered LED circuit, place the voltmeter across the LED, and connect the isolated ohmmeter only to the LDR.",
      "Set two circuits separately, align LDR/LED, measure d, switchon/wait/readVandR; change wire length, repeat.",
      "Read the instrument beside the apparatus and transcribe the raw observation before changing the trial."
    ],
    "measurementTargets": [
      {
        "label": "Wire length L and LED–LDR separation d",
        "unit": "m",
        "instrument": "ruler"
      },
      {
        "label": "LED voltage V",
        "unit": "V",
        "instrument": "voltmeter"
      },
      {
        "label": "LDR resistance R",
        "unit": "ohm",
        "instrument": "ohmmeter"
      }
    ],
    "cautions": [
      "Adapted/generated teaching apparatus; not official Cambridge software.",
      "The two circuits are electrically separate. Wait for LDR response and keep illumination geometry controlled; device calibration remains provisional.",
      "PROVISIONAL SYNTHETIC ADAPTATION — NOT VALIDATED APPARATUS. This source-checked workflow uses uncalibrated synthetic behaviour. It must not be described as physically calibrated, apparatus-faithful, or completed until real-apparatus validation is recorded."
    ],
    "provisional": true
  },
  "9702_w25_34-q1": {
    "title": "Equilibrium of forces",
    "family": "spring_supported_variable_pivot_rod",
    "category": "mechanics",
    "parts": [
      {
        "id": "stand",
        "label": "Rod and spring support",
        "kind": "stand",
        "x": 115,
        "y": 330,
        "purpose": "Carry upper and lower nails."
      },
      {
        "id": "pivot",
        "label": "Selectable lower pivot nail",
        "kind": "peg",
        "x": 255,
        "y": 370,
        "purpose": "Locate the selected rod hole.",
        "requires": [
          "stand"
        ]
      },
      {
        "id": "upper",
        "label": "Adjustable upper nail",
        "kind": "clamp",
        "x": 250,
        "y": 125,
        "purpose": "Move to level the loaded rod.",
        "requires": [
          "stand"
        ]
      },
      {
        "id": "rod",
        "label": "Drilled wooden strip",
        "kind": "rod",
        "x": 445,
        "y": 365,
        "purpose": "Rotate about the selected hole.",
        "requires": [
          "pivot"
        ]
      },
      {
        "id": "spring",
        "label": "Supporting spring",
        "kind": "spring",
        "x": 355,
        "y": 240,
        "purpose": "Stretch under the rod and load.",
        "requires": [
          "upper"
        ]
      },
      {
        "id": "string",
        "label": "Connecting string",
        "kind": "string",
        "x": 455,
        "y": 310,
        "purpose": "Join spring to the source rod attachment.",
        "requires": [
          "spring",
          "rod"
        ]
      },
      {
        "id": "mass",
        "label": "Slotted load",
        "kind": "mass",
        "x": 590,
        "y": 410,
        "purpose": "Load the rod at its fixed source position.",
        "requires": [
          "rod"
        ]
      },
      {
        "id": "ruler",
        "label": "Metre rule",
        "kind": "ruler",
        "x": 820,
        "y": 130,
        "purpose": "Measure from the selected physical endpoints, with the scale aligned to the apparatus."
      },
      {
        "id": "protractor",
        "label": "Protractor",
        "kind": "protractor",
        "x": 820,
        "y": 280,
        "purpose": "Align the centre and reference axis before reading the angle."
      }
    ],
    "connections": [
      {
        "to": "pivot:mount",
        "label": "Place pivot nail",
        "from": "stand:lower-boss"
      },
      {
        "to": "rod:hole",
        "label": "Select pivot hole",
        "from": "pivot:tip"
      },
      {
        "to": "upper:mount",
        "label": "Place upper nail",
        "from": "stand:upper-boss"
      },
      {
        "to": "spring:top",
        "label": "Hang spring",
        "from": "upper:hook"
      },
      {
        "to": "string:top",
        "label": "Join string",
        "from": "spring:bottom"
      },
      {
        "to": "rod:attachment",
        "label": "Support rod",
        "from": "string:bottom"
      },
      {
        "to": "mass:hook",
        "label": "Hang load",
        "from": "rod:load-point"
      }
    ],
    "steps": [
      "Place stand, nails and rod; choose a pivot hole.",
      "Attach spring, string and load separately, then adjust upper support to level the rod.",
      "Move lower nail to selected hole; adjust upper boss to levelrod; measure both separation N and coil length L.",
      "Read the instrument beside the apparatus and transcribe the raw observation before changing the trial."
    ],
    "measurementTargets": [
      {
        "label": "W, N, spring coil length L",
        "unit": "m",
        "instrument": "ruler"
      },
      {
        "label": "Rod level check",
        "unit": "degree",
        "instrument": "protractor"
      }
    ],
    "cautions": [
      "Adapted/generated teaching apparatus; not official Cambridge software.",
      "Measure coil length rather than the entire relaxed spring/string assembly; changing pivot hole requires re-levelling.",
      "Idealised adapted model; source alignment does not establish physical apparatus calibration."
    ],
    "provisional": false
  },
  "9702_w25_34-q2": {
    "title": "Sphere rolling along a track",
    "family": "sphere_on_two_rails",
    "category": "mechanics",
    "parts": [
      {
        "id": "track",
        "label": "Two-rail UPVC track",
        "kind": "board",
        "x": 350,
        "y": 325,
        "purpose": "Support the sphere on both rail edges."
      },
      {
        "id": "support",
        "label": "Raised-end support stack",
        "kind": "mass",
        "x": 175,
        "y": 435,
        "purpose": "Set underside clearance h without changing rail gap."
      },
      {
        "id": "ball",
        "label": "First rolling sphere",
        "kind": "ball",
        "x": 200,
        "y": 245,
        "purpose": "Start from rest behind the card gate."
      },
      {
        "id": "ball-spare",
        "label": "Comparison sphere",
        "kind": "ball",
        "x": 590,
        "y": 180,
        "purpose": "Exchange sphere diameter between trials.",
        "optional": true
      },
      {
        "id": "gate",
        "label": "Release card gate",
        "kind": "card",
        "x": 290,
        "y": 235,
        "purpose": "Withdraw without pushing the sphere."
      },
      {
        "id": "tray",
        "label": "End collection box",
        "kind": "tray",
        "x": 595,
        "y": 440,
        "purpose": "Catch the sphere after the timing distance."
      },
      {
        "id": "ruler",
        "label": "Metre rule",
        "kind": "ruler",
        "x": 820,
        "y": 130,
        "purpose": "Measure from the selected physical endpoints, with the scale aligned to the apparatus."
      },
      {
        "id": "stopwatch",
        "label": "Manual stopwatch",
        "kind": "stopwatch",
        "x": 820,
        "y": 470,
        "purpose": "Start and stop manually at observed events; read elapsed physical time, not the model period."
      }
    ],
    "connections": [
      {
        "to": "track:underside",
        "label": "Raise track end",
        "from": "support:top"
      },
      {
        "to": "track:start",
        "label": "Place release gate",
        "from": "gate:edge"
      }
    ],
    "steps": [
      "Place the track and support stack and measure the rail gap and underside clearance.",
      "Measure the selected sphere, place the end box and card gate, and set the sphere behind the gate.",
      "Measure railgap and sphere with ruler, settrack andblock, release/time tobox; changeonly sphere.",
      "Read the instrument beside the apparatus and transcribe the raw observation before changing the trial."
    ],
    "measurementTargets": [
      {
        "label": "Rail gap x, rise h, sphere diameter d",
        "unit": "m",
        "instrument": "ruler"
      },
      {
        "label": "Travel time t",
        "unit": "s",
        "instrument": "stopwatch"
      }
    ],
    "cautions": [
      "Adapted/generated teaching apparatus; not official Cambridge software.",
      "Sphere diameter must exceed the rail gap; the sphere must contact both rail edges and not the channel bottom.",
      "Idealised adapted model; source alignment does not establish physical apparatus calibration."
    ],
    "provisional": false
  }
};

export default rooms;
