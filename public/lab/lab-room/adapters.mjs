// Adapters over the source-reviewed models. Only measured readings leave this
// closure; periods, fitted constants and reference vectors never enter notebooks.
import {readInstrument,seededRandom} from '../lib/measurement.mjs';
const RAD=Math.PI/180;
export async function createExperiment(id,definition){
  const family=id==='9702_w23_33-q1'?'interrupted_pendulum_fixed_length':definition.family;
  const module=await import(`../models/${family}.mjs`);
  const factory=Object.entries(module).find(([k,v])=>k.startsWith('make')&&typeof v==='function')?.[1];
  if(!factory)throw new Error(`No physics model for ${id}`);
  const model=factory(), random=seededRandom(970234);
  const controls=structuredClone(definition.controls), settings=Object.fromEntries(controls.map(c=>[c.key,c.value]));
  let elapsed=0,active=false,closed=false,motion=null,lastView={},measured={};
  const n=(key,fallback=0)=>Number(settings[key]??fallback),s=(key,fallback='')=>String(settings[key]??fallback);
  const pendulum=(angle,length=.35)=>({kind:'swing',angle,dx:length*Math.sin(angle*RAD)*650,dy:length*(1-Math.cos(angle*RAD))*-650});
  const cylinderVolume=volume=>({kind:'liquid',fill:Math.max(0,Math.min(1,volume)),volume});
  function start(){
    elapsed=0; active=true; closed=true;
    switch(family){
      case 'compound_t_pendulum':motion=model.createMotion(n('position'),n('amplitude'));break;
      case 'counterweighted_compound_pendulum':motion=model.createMotion(n('mass'),n('amplitude'));break;
      case 'falling_mass_rotating_card':motion=model.createMotion(s('card'));break;
      case 'colliding_pendulum_balls':motion=model.createMotion(Boolean(settings.added),s('alignment'));break;
      case 'magnetic_inelastic_pickup':motion=model.createMotion(n('nut'));break;
      case 'wrapping_mass_dynamics':motion=model.trial(n('theta'));break;
      case 'led_ldr_photoresistance':motion=model.createResponse();break;
    }
    return view();
  }
  function reset(){elapsed=0;active=closed=false;motion=null;measured={};return view();}
  function set(key,value){const previous=settings[key];settings[key]=value;try{const result=view();measured={};return result;}catch(error){settings[key]=previous;throw error;}}
  function advance(dt){
    if(!Number.isFinite(dt)||dt<0||dt>.25)throw new RangeError('Use a frame step from 0 to 0.25 s');
    if(active){elapsed+=dt;if(dt>0&&motion?.advance&&family!=='led_ldr_photoresistance')motion.advance(dt);}
    if(family==='led_ldr_photoresistance'&&motion)lastView.device=motion.advance(dt,n('length'),.03,n('angle'),closed);
    return view();
  }
  function view(){
    const t=active?elapsed:0;let v={kind:'static',status:'Assemble and inspect the apparatus.'};
    switch(family){
      case 'static_spring_rod':v={kind:'lever',angle:model.tiltDegrees(n('str')/1000),extension:model.extension(n('x')),status:Math.abs(n('str'))<1?'Rod horizontal. Read both ruler marks.':'Adjust the string until the rod is horizontal.'};break;
      case 'gas_flow_hole':v={...cylinderVolume(active?1-model.interfacePosition(s('tool'),t)/1.2:1),status:'Time the interface between the two marks; do not use the fill level as a digital reading.'};break;
      case 'hydrostatic_u_tube':{const q=model.geometry(n('height'));v={kind:'utube',left:q.a_m,right:q.b_m,topLeft:q.surfaceA_m,topRight:q.surfaceB_m,oil:n('height'),status:'Read the two water–oil interfaces, not the top oil surfaces.'};break;}
      case 'spring_network_oscillator':v={kind:'spring',dy:model.displacement(n('configuration'),n('configuration')===1?1:.75,n('amplitude'),t)*1800,status:'Count complete oscillations and operate your own stopwatch.'};break;
      case 'rod_pulley_equilibrium':v={kind:'lever',angle:model.equilibrium(n('notch')).theta_deg-90,status:model.alignment(n('notch'),n('pulleyHeight'))};break;
      case 'lens_in_solution':v={kind:'optics',...model.image(n('solution'),n('object'),n('screenDistance')),status:'Slide the torch and screen to obtain the sharpest image.'};break;
      case 'compound_t_pendulum':v=pendulum((motion??model.createMotion(n('position'),n('amplitude'))).snapshot().angle_deg);break;
      case 'ladder_static_friction':{const q=model.trial(s('strip'),s('end'),n('base'));v={kind:'lever',angle:active&&!q.stable?0:-q.theta_deg,status:q.stable?'Strip remains supported.':'Strip slips: restore support before reading an angle.',unstable:active&&!q.stable};break;}
      case 'shorted_resistance_wire':v={kind:'circuit',powered:closed};break;
      case 'thermal_pipe_lever':{const q=model.state(n('length'),n('water'),t);v={kind:'thermal',angle:active?(q.pointer_m-.22)*1800:0,temperature:active?q.water_C:22,status:'Observe the lowest pointer position before taking the hot reading.'};break;}
      case 'complementary_series_wires':v={kind:'circuit',powered:closed,status:Math.abs(n('g')-n('h'))<=.002?'Contacts aligned.':'Align the two contacts to the same wire coordinate.'};break;
      case 'spring_torsional_rod':v={kind:'lever',angle:active?model.angle(n('b'),n('amplitude'),t):model.levelError(n('level')),status:'Level the loaded strip before releasing a small twist.'};break;
      case 'catenary_transverse_pendulum':v={kind:'chain',dx:active?model.angle(n('separation'),n('amplitude'),t)*5:0,sag:model.configuration(n('separation')).C_m,status:'Observe transverse motion; keep both supports at equal height.'};break;
      case 'foam_ring_compression':v={kind:'compression',compression:model.geometry(s('ring'),active).compression_m,status:active?'Load applied. Read compressed height.':'Read unloaded dimensions before adding the load.'};break;
      case 'parallel_wire_voltage_divider':v={kind:'circuit',powered:closed};break;
      case 'wrapping_mass_dynamics':v={kind:'fall',dy:active?motion.state(t).fall_m*750:0,status:'Provisional endpoint surrogate: the wrapping transient is illustrative, not validated contact dynamics.'};break;
      case 'rc_discharge_parallel':v={kind:'circuit',powered:closed,charge:active?model.voltage(n('resistor'),t)/6:1,status:'Switch starts discharge. Independently start/stop the watch while reading voltage.'};break;
      case 'liquid_adhesion_drainage':v={...cylinderVolume(active?model.volume(s('liquid'),t)/11:1),status:'Time the marked drainage interval; force is measured separately with a slow pull.'};break;
      case 'cylinder_wrapped_pendulum':v=pendulum(model.angle(n('length'),n('amplitude'),t),n('length'));break;
      case 'lamina_centroid':v={kind:'card',angle:model.suspension(n('width'),n('hole')).angle/RAD,status:'Suspend from each hole and mark plumb lines. Find their intersection yourself.'};break;
      case 'counterweighted_compound_pendulum':v=pendulum((motion??model.createMotion(n('mass'),n('amplitude'))).snapshot().angle_deg);break;
      case 'thermal_pipe_suspended_lever':{const q=model.state(n('length'),n('temperature',82),t);v={kind:'thermal',angle:active?(q.pointer_m-.3)*1800:0,temperature:active?q.pipe_C:22,status:'Wait for the tube and water to approach thermal equilibrium.'};break;}
      case 'loaded_rule_balance':{const q=model.settled(n('n'),n('arm',.475),n('pivot'));v={kind:'lever',angle:active?q.tilt_deg:0,status:q.balanced?'Rule balances.':'Move the knife edge to balance the rule.',balanced:q.balanced};break;}
      case 'rubber_lateral_contraction':{const q=model.ideal(n('ratio'));v={kind:'stretch',scaleY:n('ratio'),scaleX:1/Math.sqrt(n('ratio')),status:'Use light micrometer contact to avoid compressing the rubber.'};break;}
      case 'symmetric_movable_pulley':v={kind:'pulley',dy:model.ideal(n('mass')).sag_m*700,status:'Keep the pulley axes in one plane and read the angle from the vertical.'};break;
      case 'falling_mass_rotating_card':{const q=(motion??model.createMotion(s('card'))).snapshot();v={kind:'spin-fall',dy:q.fraction*260,angle:q.angle_rad/RAD,status:q.landed?'Mass has landed; stop the watch yourself.':'Wind up, release and observe the falling mass and rotating card.'};break;}
      case 'wire_shunt_equal_resistors':v={kind:'circuit',powered:closed};break;
      case 'asymmetric_loaded_chain':v={kind:'chain',dx:active?model.angle(n('condition'),t)*6:0,status:'Keep the clay at the source-specified clip for the selected condition.'};break;
      case 'interrupted_pendulum':{const q=model.motion(n('length')+.33,n('length'),n('amplitude'),t);v={kind:'swing',angle:q.angle_deg,dx:q.bob_x_m*650,dy:(q.bob_y_m-(n('length')+.33))*650,status:`Bob on ${q.side} arc. One cycle includes both sides.`};break;}
      case 'confined_ball_settling':v={kind:'fall',dy:active?Math.min(290,model.state(n('diameter'),t).z_m*360):0,status:'Start and stop as the ball crosses the timing marks.'};break;
      case 'parallel_resistor_network':v={kind:'circuit',powered:closed};break;
      case 'filter_paper_fall':{const q=model.state(n('stack')===0?6:2,n('stack')===0?.11:.18,t,n('tilt'));v={kind:'fall',dy:active?q.fraction*310:0,status:q.landed?'Stack landed.':'Release the horizontal paper stack without a push.'};break;}
      case 'wire_bridge_null':case 'meter_bridge_parallel_resistor':v={kind:'circuit',powered:closed,status:'Slide the jockey and bracket the detector zero; do not assume a preset null.'};break;
      case 'suspended_rod_two_modes':{const q=model.shape(n('depth'),s('mode'),t);v={kind:'lever',angle:s('mode')==='S'?q.angle_deg:0,dx:q.centre[2]*1300,status:`Observe ${s('mode')==='S'?'rocking':'parallel translation'}; time full cycles.`};break;}
      case 'folded_wire_series_resistivity':case 'wire_voltage_divider_resistivity':v={kind:'circuit',powered:closed};break;
      case 'buoyancy_series_springs':v={kind:'spring',dy:(model.length(s('load'),s('medium')==='oil')-.15)*600,status:'Keep the immersed nut clear of the vessel walls and bottom.'};break;
      case 'cylinder_step_stability':v={kind:'incline',angle:-Math.asin(n('height')/.35)/RAD,unstable:!model.stable(n('pileT'),n('height')),status:model.stable(n('pileT'),n('height'))?'Cylinder remains stable.':'Toppling boundary reached; reset for another trial.'};break;
      case 'magnet_coil_cantilever':{const I=model.current(n('rheostat'),closed);v={kind:'lever',angle:(model.height(true,I,n('polarity'))-.4)*700,powered:closed,status:I>.75?'Increase the rheostat resistance: outside the model range.':'Observe cantilever deflection as current changes.'};break;}
      case 'interrupted_pendulum_fixed_length':{const q=model.motion(n('separation'),n('amplitude'),t);v={kind:'swing',angle:q.angle_deg,dx:q.bob_x_m*650,dy:(q.bob_y_m-.53)*650,status:`Bob on ${q.side} arc.`};break;}
      case 'inclined_rod_lift':{const q=model.state(n('distance'),n('force'));v={kind:'lever',angle:q.lifted?-40:-36,status:q.lifted?'Rod has just lost contact. Read the newton meter.':'Increase the upward pull slowly.'};break;}
      case 'water_jet_ballistics':v={kind:'jet',head:model.head(t),fill:active?model.head(t)/.12:1,jet:active,status:'Watch the falling jet reach the target rod; mark the water head at that instant.'};break;
      case 'colliding_pendulum_balls':{const q=(motion??model.createMotion(Boolean(settings.added),s('alignment'))).snapshot();v={kind:'collision',dx:Math.sin(q.a_angle_rad)*280,dy:(Math.cos(q.a_angle_rad)-1)*280,dx2:Math.sin(q.b_angle_rad)*280,dy2:(Math.cos(q.b_angle_rad)-1)*280,hit:q.hit,status:q.hit?'Observe the first maximum of the second ball.':'Release the striker without a push.'};break;}
      case 'syringe_nozzle_drainage':v={...cylinderVolume(model.volume(n('top')+2.5,t)/52.5),status:'Time the meniscus between marks separated by 5 cm³.'};break;
      case 'magnetic_inelastic_pickup':{const q=(motion??model.createMotion(n('nut'))).snapshot();v={kind:'pickup',angle:q.angle_rad/RAD,dx:q.x_m*650,dy:(Math.cos(q.angle_rad)-1)*312,hit:q.hit,status:q.hit?'Nut captured; observe the first return excursion.':'Release the magnet toward the stationary nut.'};break;}
      case 'inclined_board_rolling_pendulum':{const q=model.motion(n('height'),t);v={kind:'swing',dx:q.x_m*650,dy:(q.y_m-.375)*650,angle:q.spin_rad/RAD,status:'The bob rolls on the inclined board; time full cycles.'};break;}
      case 'led_ldr_photoresistance':v={kind:'circuit',powered:closed,status:'LED and ohmmeter use separate circuits. Allow the light response to settle.',device:lastView.device};break;
      case 'spring_supported_variable_pivot_rod':{const q=model.state(n('hole'),n('height'));v={kind:'lever',angle:-q.angle_rad/RAD,extension:q.L_m,status:q.level?'Rod horizontal. Read the spring length.':'Adjust the upper nail to bring the rod horizontal.'};break;}
      case 'sphere_on_two_rails':{const q=model.motion(n('sphere'),n('height'),t);v={kind:'roll',dx:active?q.fraction*330:0,dy:active?q.fraction*n('height')*3500:0,angle:q.spin_rad/RAD,status:q.arrived?'Sphere reached the end. Stop your watch.':'Start your stopwatch and release the sphere.'};break;}
      default:throw new Error(`Missing view adapter: ${family}`);
    }
    lastView={...lastView,...v};return lastView;
  }
  function sample(){
    let r={}; const t=elapsed;
    switch(family){
      case 'static_spring_rod':r={x:readInstrument(n('x'),{resolution:.001,halfWidth:.001},random),c0:readInstrument(.02,{resolution:.001,halfWidth:.001},random),c:readInstrument(model.springMark(n('x')),{resolution:.001,halfWidth:.001},random)};break;
      case 'gas_flow_hole':r=model.readDimensions(s('tool'));break;
      case 'hydrostatic_u_tube':r=model.readColumns(n('height'));break;
      case 'spring_network_oscillator':r={d:model.readDiameter(n('configuration')===1?1:.75)};break;
      case 'rod_pulley_equilibrium':r=model.read(n('notch'),n('pulleyHeight'));break;
      case 'lens_in_solution':r=model.read(n('solution'),n('object'),n('screenDistance'));break;
      case 'compound_t_pendulum':r={x:model.readPosition(n('position'))};break;
      case 'ladder_static_friction':r={...model.readSetup(s('strip')),theta:model.readAngle(s('strip'),s('end'),n('base'))};break;
      case 'shorted_resistance_wire':r=model.read(n('length'),closed);break;
      case 'thermal_pipe_lever':r={...model.readCold(n('length')),...(active?model.readHot(n('length'),n('water'),t):{})};break;
      case 'complementary_series_wires':if(Math.abs(n('g')-n('h'))>.002)throw new Error('Align G and H before taking current readings.');r=model.read(n('g'),closed);break;
      case 'spring_torsional_rod':r=model.readGeometry(n('b'));break;
      case 'catenary_transverse_pendulum':r=model.readGeometry(n('separation'));break;
      case 'foam_ring_compression':r={...model.readInitial(s('ring')),...(active?model.readLoaded(s('ring')):{})};break;
      case 'parallel_wire_voltage_divider':r=model.read(n('d'),closed);break;
      case 'wrapping_mass_dynamics':if(!active||!motion.state(t).finished)throw new Error('Wait for the winding to stop before reading the height.');r=motion.read(t);break;
      case 'rc_discharge_parallel':r={v:model.readVoltage(n('resistor'),active?t:0)};break;
      case 'liquid_adhesion_drainage':r={w:model.readWeight(),f:model.readPeak(s('liquid'),n('speed')),volume:model.readVolume(s('liquid'),t)};break;
      case 'cylinder_wrapped_pendulum':r={l:model.readLength(n('length'))};break;
      case 'lamina_centroid':r=model.readDimensions(n('width'));break;
      case 'counterweighted_compound_pendulum':r={mass:model.readMass(n('mass'))};break;
      case 'thermal_pipe_suspended_lever':r={...model.readCold(n('length')),...(active?model.readHot(n('length'),n('temperature',82),t):{})};break;
      case 'loaded_rule_balance':r=model.read(n('n'),n('arm',.475),n('pivot'));break;
      case 'rubber_lateral_contraction':r={...model.readRelaxed(s('pressure')),...model.readStretched(n('ratio'),s('pressure'))};break;
      case 'symmetric_movable_pulley':r=model.read(n('mass'));break;
      case 'falling_mass_rotating_card':if(s('card')!=='none')r=model.readDimensions(s('card'));break;
      case 'wire_shunt_equal_resistors':r={e:model.readSupply(),l:model.readLength(n('length')),v:model.readVoltage(n('length'),closed)};break;
      case 'asymmetric_loaded_chain':r=model.readGeometry(n('condition'));break;
      case 'interrupted_pendulum':r=model.readLengths(n('length')+.33,n('length'));break;
      case 'confined_ball_settling':r=model.readDiameters(n('diameter'));break;
      case 'parallel_resistor_network':r={i:model.readCurrent(n('r1'),n('r2'),closed)};break;
      case 'filter_paper_fall':r=model.readStack(n('stack')===0?6:2,n('stack')===0?.11:.18);break;
      case 'wire_bridge_null':r={...model.readLengths(n('p'),n('q')),v:model.readVoltage(n('p'),n('q'),closed)};break;
      case 'suspended_rod_two_modes':r=model.readGeometry(n('depth'));break;
      case 'folded_wire_series_resistivity':r={e:model.readSupply(),d:model.readDiameter(),x:model.readLength(n('x')),v:model.readVoltage(n('x'),closed)};break;
      case 'buoyancy_series_springs':r={l:model.readLength(s('load'),s('medium')==='oil'),...(['M12','M16'].includes(s('load'))?{m:model.readMass(s('load'))}:{})};break;
      case 'cylinder_step_stability':r={...model.readSetup(n('pileT')),z:model.readHeight(n('height'))};break;
      case 'magnet_coil_cantilever':r={i:model.readCurrent(n('rheostat'),closed),h:model.readHeight(true,model.current(n('rheostat'),closed),n('polarity')),m:model.readMassLabel()};break;
      case 'interrupted_pendulum_fixed_length':r=model.readLengths(n('separation'));break;
      case 'inclined_rod_lift':r={...model.readDimensions(n('distance')),f:model.readForce(n('force'))};break;
      case 'meter_bridge_parallel_resistor':r={...model.readLengths(n('resistor'),n('a')),v:model.readVoltage(n('resistor'),n('a'),closed)};break;
      case 'water_jet_ballistics':r={...model.readGeometry(n('base')),h:model.readHead(t)};break;
      case 'wire_voltage_divider_resistivity':r={l:model.readLength(n('length')),d:model.readDiameter(),v:model.readVoltage(n('length'),closed)};break;
      case 'colliding_pendulum_balls':r={...model.readSetup(),...(motion?.snapshot().hit?{h:model.readHeight(motion.snapshot().b_height_m)}:{})};break;
      case 'syringe_nozzle_drainage':r={...model.readHeights(n('top')),volume:readInstrument(model.volume(n('top')+2.5,t),{resolution:.5},random)};break;
      case 'magnetic_inelastic_pickup':r={...model.readSetup(n('nut')),...(motion?.snapshot().hit&&motion.snapshot().x_m>=0?{x:model.readX(motion.snapshot().x_m)}:{})};break;
      case 'inclined_board_rolling_pendulum':r=model.readLengths(n('height'));break;
      case 'led_ldr_photoresistance':{const device=motion??model.createResponse();r={...model.readGeometry(n('length')),...model.readMeters(device.advance(0,n('length'),.03,n('angle'),closed))};break;}
      case 'spring_supported_variable_pivot_rod':r=model.read(n('hole'),n('height'));break;
      case 'sphere_on_two_rails':r=model.readGeometry(n('sphere'),n('height'));break;
      default:throw new Error(`Missing readings adapter: ${family}`);
    }
    measured=Object.fromEntries(Object.entries(r).filter(([,v])=>typeof v==='number'&&Number.isFinite(v)));
    return {...measured};
  }
  return {controls,settings,family,start,reset,set,advance,view,sample,
    openSwitch(){closed=false;},get active(){return active;},get elapsed(){return elapsed;},get closed(){return closed;}};
}
