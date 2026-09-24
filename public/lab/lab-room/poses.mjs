// Scene geometry adapters. These map the reviewed model's observable motion to
// the student's mounted parts; no sinusoidal placeholder runs on a static rig.
export const dragControls={
 static_spring_rod:{string:['x','x'],upper:['str','y']},gas_flow_hole:{piercer:['tool','x']},hydrostatic_u_tube:{dropper:['height','y']},spring_network_oscillator:{clay:['amplitude','y']},rod_pulley_equilibrium:{pulley:['pulleyHeight','y'],rod:['notch','x']},lens_in_solution:{lamp:['object','x'],screen:['screenDistance','x']},compound_t_pendulum:{'mass-left':['position','x'],'mass-right':['position','x'],rod:['amplitude','x']},ladder_static_friction:{rod:['base','x']},shorted_resistance_wire:{short:['length','x']},thermal_pipe_lever:{water:['water','y']},complementary_series_wires:{'clip-g':['g','x'],'clip-h':['h','x']},spring_torsional_rod:{spring:['b','x'],rod:['amplitude','y']},catenary_transverse_pendulum:{'stand-right':['separation','x'],chain:['amplitude','x']},foam_ring_compression:{rod:['level','y']},parallel_wire_voltage_divider:{clip:['d','x']},wrapping_mass_dynamics:{small:['theta','x']},rc_discharge_parallel:{resistor:['resistor','x']},liquid_adhesion_drainage:{acrylic:['speed','y']},cylinder_wrapped_pendulum:{bob:['amplitude','x'],string:['length','y']},lamina_centroid:{card:['hole','x']},counterweighted_compound_pendulum:{upper:['mass','y'],rod:['amplitude','x']},thermal_pipe_suspended_lever:{pipe:['length','x']},loaded_rule_balance:{pivot:['pivot','x'],transfer:['n','x']},rubber_lateral_contraction:{clamp:['ratio','y']},symmetric_movable_pulley:{hanger:['mass','y']},falling_mass_rotating_card:{card:['card','x']},wire_shunt_equal_resistors:{clip:['length','x']},asymmetric_loaded_chain:{'clay-a':['condition','x']},interrupted_pendulum:{peg:['length','y'],bob:['amplitude','x']},confined_ball_settling:{ball:['diameter','x']},parallel_resistor_network:{'resistor-a':['r1','x'],'resistor-b':['r2','x']},filter_paper_fall:{paper:['tilt','x']},wire_bridge_null:{'clip-a':['p','x'],'clip-c':['q','x']},suspended_rod_two_modes:{pin:['depth','y']},folded_wire_series_resistivity:{clip:['x','x']},buoyancy_series_springs:{load:['load','y']},cylinder_step_stability:{support:['height','y']},magnet_coil_cantilever:{rheostat:['rheostat','x']},interrupted_pendulum_fixed_length:{peg:['separation','y'],bob:['amplitude','x']},inclined_rod_lift:{'force-meter':['force','y'],mass:['distance','x']},meter_bridge_parallel_resistor:{clip:['a','x']},water_jet_ballistics:{bottle:['base','y']},wire_voltage_divider_resistivity:{clip:['length','x']},colliding_pendulum_balls:{'ball-a':['alignment','x']},syringe_nozzle_drainage:{syringe:['top','y']},magnetic_inelastic_pickup:{nut:['nut','x']},inclined_board_rolling_pendulum:{clamp:['height','y']},led_ldr_photoresistance:{clip:['length','x'],led:['angle','y']},spring_supported_variable_pivot_rod:{upper:['height','y'],pivot:['hole','x']},sphere_on_two_rails:{support:['height','y'],ball:['sphere','x']}
};
export function applyPoses(family,parts,settings,v,bounds){
 const by=id=>parts.find(p=>p.id===id&&p.placed),kinds=k=>parts.filter(p=>p.kind===k&&p.placed),n=(k,d=0)=>Number(settings[k]??d),shift=(id,dx=0,dy=0,a=0)=>{const p=by(id);if(p){p.dx=dx;p.dy=dy;p.angle=a;}},rotate=(ids,pivot,angle)=>{if(!pivot)return;const a=angle*Math.PI/180;for(const id of ids){const p=by(id);if(!p)continue;const x=p.px-pivot.px,y=p.py-pivot.py;p.dx=x*Math.cos(a)-y*Math.sin(a)-x;p.dy=x*Math.sin(a)+y*Math.cos(a)-y;p.angle=angle;}};
 // Each explicit pose replaces the generic movement for its multi-body apparatus.
 const clear=()=>{for(const p of parts){p.dx=p.dy=p.angle=0;p.sx=p.sy=1;}};
 switch(family){
 case 'spring_network_oscillator':{clear();const top=by('clamp'),bottom=by('lower-clamp'),clay=by('clay');if(!top||!bottom||!clay)break;const joint=n('configuration'),span=bottom.py-top.py,centre=top.py+span*joint/4+(v.dy||0);clay.dx=top.px-clay.px;clay.dy=centre-clay.py;for(let i=1;i<=4;i++){const p=by('spring-'+i);if(!p)continue;const lo=i<=joint?top.py+(centre-top.py)*(i-1)/joint:centre+(bottom.py-centre)*(i-joint-1)/(4-joint),hi=i<=joint?top.py+(centre-top.py)*i/joint:centre+(bottom.py-centre)*(i-joint)/(4-joint);p.dx=top.px-p.px;p.dy=(lo+hi)/2-p.py;p.sy=(hi-lo)/bounds(p).h;}break;}
 case 'compound_t_pendulum':clear();{const pivot=by('pivot');if(!pivot)break;for(const[id,sign]of[['mass-left',-1],['mass-right',1]]){const p=by(id);if(p){p.dx=pivot.px+sign*n('position')*650-p.px;}}
 const a=(v.angle||0)*Math.PI/180;for(const id of['rod','crossbar','mass-left','mass-right']){const p=by(id);if(!p)continue;const x=p.px+p.dx-pivot.px,y=p.py-pivot.py;p.dx=pivot.px+x*Math.cos(a)-y*Math.sin(a)-p.px;p.dy=pivot.py+x*Math.sin(a)+y*Math.cos(a)-p.py;p.angle=v.angle||0;}}break;
 case 'counterweighted_compound_pendulum':clear();rotate(['rod','upper','lower'],by('pivot'),v.angle||0);break;
 case 'spring_torsional_rod':clear();rotate(['rod','mass-left','mass-right'],by('rod'),v.angle||0);break;
 case 'suspended_rod_two_modes':clear();rotate(['rod','mass'],by('pin'),v.angle||0);if(settings.mode==='B'){shift('rod',v.dx||0);shift('mass',v.dx||0);}break;
 case 'catenary_transverse_pendulum':clear();shift('chain',v.dx||0);shift('mass',v.dx||0);shift('stand-right',(n('separation')-.6)*400);break;
 case 'asymmetric_loaded_chain':clear();shift('chain',v.dx||0);shift('clay-a',v.dx||0);shift('clay-b',v.dx||0);break;
 case 'static_spring_rod':clear();rotate(['rod'],by('pivot'),v.angle||0);shift('string',(n('x')-.245)*600);shift('upper',0,-n('str')*1.5);break;
 case 'rod_pulley_equilibrium':clear();rotate(['rod'],by('stand'),v.angle||0);shift('pulley',0,-(n('pulleyHeight')-.4)*700);break;
 case 'lens_in_solution':clear();shift('lamp',-(n('object')-10)*3.1);shift('screen',(n('screenDistance')-40)*25);break;
 case 'ladder_static_friction':clear();shift('rod',(n('base')-.2)*500,0,v.angle||0);break;
 case 'thermal_pipe_lever':case 'thermal_pipe_suspended_lever':clear();rotate(['lever'],by('pivot')||by('lever'),v.angle||0);break;
 case 'loaded_rule_balance':clear();shift('pivot',(n('pivot')-.4)*700);rotate(['rod','end-mass','transfer'],by('pivot'),v.angle||0);break;
 case 'symmetric_movable_pulley':clear();shift('pulley',0,(v.dy||0)-105);shift('load',0,(v.dy||0)-105);shift('hanger',0,-((v.dy||0)-105)*1.6);break;
 case 'falling_mass_rotating_card':clear();shift('card',0,0,v.angle||0);shift('mass',0,Math.min(100,v.dy||0));break;
 case 'wrapping_mass_dynamics':clear();shift('heavy',0,Math.min(70,v.dy||0));shift('small',-(v.dy||0)*.6,-(v.dy||0)*.35);break;
 case 'confined_ball_settling':clear();shift('ball',0,v.dy||0);break;
 case 'filter_paper_fall':clear();shift('paper',0,v.dy||0,n('tilt'));break;
 case 'cylinder_step_stability':clear();rotate(['board','bottle','paper'],by('support'),v.angle||0);if(v.unstable){const p=by('bottle');if(p)p.angle+=45;}break;
 case 'magnet_coil_cantilever':clear();shift('magnet',0,(v.angle||0)*3);shift('spring',0,(v.angle||0)*1.5,(v.angle||0));break;
 case 'inclined_rod_lift':clear();rotate(['rod','mass'],by('pivot'),(v.angle||0)+36);break;
 case 'magnetic_inelastic_pickup':clear();rotate(['rod','magnet'],by('pivot'),v.angle||0);if(v.hit){const p=by('nut'),m=by('magnet');if(p&&m){p.dx=m.px+m.dx-p.px;p.dy=m.py+m.dy-p.py+20;}}break;
 case 'spring_supported_variable_pivot_rod':clear();rotate(['rod','mass'],by('pivot'),v.angle||0);shift('upper',0,-(n('height')-.4)*650);break;
 case 'sphere_on_two_rails':clear();shift('ball',v.dx||0,v.dy||0,v.angle||0);{const track=by('track');if(track)track.angle=Math.atan(n('height')/.6)*180/Math.PI;}break;
 case 'hydrostatic_u_tube':clear();break;
 }
 // Contact position changes are visible in the actual circuit, not just a slider.
 const contactMap={shorted_resistance_wire:['short','length',.45],complementary_series_wires:['clip-g','g',.3],parallel_wire_voltage_divider:['clip','d',.4],wire_shunt_equal_resistors:['clip','length',.3],folded_wire_series_resistivity:['clip','x',.1],wire_voltage_divider_resistivity:['clip','length',.45],meter_bridge_parallel_resistor:['clip','a',.5],led_ldr_photoresistance:['clip','length',.1]};
 if(contactMap[family]){const[p,k,initial]=contactMap[family];shift(p,(n(k)-initial)*300);}
 if(family==='complementary_series_wires')shift('clip-h',(n('h')-.3)*300);
 if(family==='wire_bridge_null'){shift('clip-a',(n('p')-.4)*250);shift('clip-c',(n('q')-.2)*250);}
}
