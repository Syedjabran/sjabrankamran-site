// Observation metadata, not fitted constants or reference answers.
// The same letter has different meanings in different source experiments.
export function quantityInfo(family,key){
  let unit='m',label=key;
  if(family==='lens_in_solution')unit=key==='C'?'label':'cm';
  else if(key==='i')unit='A';
  else if(['v','v1','v2','e'].includes(key))unit='V';
  else if(key==='r'&&family==='led_ldr_photoresistance')unit='Ω';
  else if(key==='volume')unit='cm³';
  else if(key==='theta')unit='°';
  else if(['t','t0'].includes(key)&&family.startsWith('thermal'))unit='°C';
  else if(['f','w'].includes(key)&&family==='liquid_adhesion_drainage'||key==='f'&&family==='inclined_rod_lift')unit='N';
  else if(['mass','mass_labels','m_label','m_labels'].includes(key)||key==='m'&&['colliding_pendulum_balls','filter_paper_fall','magnet_coil_cantilever','buoyancy_series_springs','magnetic_inelastic_pickup'].includes(family))unit='kg';
  else if(key==='n'&&family==='loaded_rule_balance')unit='count';
  const instruments=({'A':['ammeter'],'V':['voltmeter','galvanometer'],'Ω':['ohmmeter'],'°C':['thermometer'],'°':['protractor'],'N':['newton-meter'],'kg':['balance','mass','bob','ball'],'cm³':['syringe','cylinder'],'count':[],'label':[]})[unit]||['ruler','micrometer','caliper'];
  if(family==='gas_flow_hole')label=({l:'Mark separation L',d:'Bottle diameter D',d_2:'Piercing tool diameter d'})[key]||key;
  if(family==='hydrostatic_u_tube')label=({f:'Oil A column F',h:'Oil B column h',a:'Interface A height a',b:'Interface B height b'})[key]||key;
  if(family==='static_spring_rod')label=({c0:'Unloaded spring mark C₀',c:'Loaded spring mark C',x:'Groove position x'})[key]||key;
  if(family==='spring_supported_variable_pivot_rod')label=({w:'Pivot coordinate W',n:'Upper nail height N',l:'Spring length L'})[key]||key;
  if(key==='volume')label='Meniscus volume';
  if(key==='mass_labels'||key==='m_labels'||key==='m_label')label='Mass label';
  return {unit,label,instruments};
}
