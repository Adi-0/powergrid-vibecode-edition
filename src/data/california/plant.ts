/**
 * Metcalf combined cycle — one power station, modelled as an energy chain.
 *
 * WHY THIS PLANT. It is the only large station inside the Bay Area, it feeds
 * the 230 kV bus that feeds Eden Vale substation, and Eden Vale feeds Cherry
 * Lane 1201, at the end of which is the socket this app terminates at. So the
 * whole application is one thread: gas burning in a turbine here, and a kettle
 * boiling there, with nothing in between left out.
 *
 * WHAT A COMBINED CYCLE IS, AND WHY IT EXISTS
 *
 * A gas turbine burns fuel, expands the hot gas through a turbine, and throws
 * the exhaust away at around 600 °C. About sixty per cent of the fuel's energy
 * leaves in that exhaust, which for most of the twentieth century simply went
 * up the stack.
 *
 * A combined cycle puts a boiler in the exhaust path — a HEAT RECOVERY STEAM
 * GENERATOR — raises steam with heat that was already paid for, and runs a
 * steam turbine on it. The same fuel does work twice. A simple-cycle gas
 * turbine reaches about 38 % efficiency; a modern combined cycle reaches about
 * 60 %, and nothing else that burns anything comes close.
 *
 * HOW THE NUMBERS HERE ARE PRODUCED
 *
 * The plant's HEAT RATE is already in the network model, because it is what
 * sets the plant's marginal cost and therefore where it sits in the merit
 * order. Efficiency and heat rate are the same fact written two ways:
 *
 *     η = 3412.14 / heat rate       (heat rate in BTU per kWh)
 *
 * because a kilowatt-hour is 3,412.14 BTU. Every split below is expressed as a
 * fraction of fuel energy, and the condenser is computed as the REMAINDER so
 * that the chain closes to the last decimal rather than approximately.
 */

import { Generator } from '../../core/network.js';

/** BTU in a kilowatt-hour. The conversion the whole industry's units rest on. */
export const BTU_PER_KWH = 3412.142;

/** The generator in the network case this plant is. */
export const PLANT_GENERATOR_ID_SITE = 'metcalf';

/**
 * How the plant is put together.
 *
 * A 1,000 MW station is built as two gas turbines and one steam turbine — a
 * "2×1" arrangement — because gas turbines come in discrete sizes and a steam
 * turbine can be built to whatever the two of them exhaust.
 */
export const PLANT_CONFIG = {
  gasTurbines: 2,
  steamTurbines: 1,
  name: 'Metcalf Energy Center',
  arrangement: '2×1 combined cycle',
  /**
   * Share of gross electrical output that comes from the gas turbines.
   *
   * Two thirds from the Brayton cycle and one third from the Rankine cycle
   * bottoming it is the characteristic split of every large combined cycle
   * built in the last thirty years.
   */
  gasTurbineShare: 0.66,
  /** Auxiliary load: pumps, fans, the cooling tower. A few per cent of gross. */
  auxiliaryFraction: 0.021,
  /** Electrical efficiency of a large generator. */
  generatorEfficiency: 0.985,
  /** Radiation and bearing losses from the turbine itself, as a fraction of fuel. */
  radiationFraction: 0.005,
  /**
   * Energy leaving the stack after the heat recovery boiler has taken what it
   * can. It cannot be zero: the flue gas has to stay hot enough that the water
   * vapour in it does not condense into acid on the cold end of the boiler.
   */
  stackFraction: 0.090,
  /** Gas turbine exhaust temperature, °C — what the boiler has to work with. */
  exhaustTempC: 610,
  /** Main steam conditions at the steam turbine stop valve. */
  steamBarG: 124,
  steamTempC: 566,
  /** Condenser pressure, millibar absolute. Near vacuum, and that is the point. */
  condenserMbar: 45,
} as const;

export type EnergyStage =
  | 'fuel' | 'gas-turbine' | 'gt-generator' | 'exhaust' | 'hrsg' | 'stack'
  | 'steam-turbine' | 'st-generator' | 'condenser' | 'auxiliary' | 'export';

export interface EnergyFlow {
  id: EnergyStage;
  name: string;
  /** Power in this stream, MW thermal or electrical as stated. */
  mw: number;
  /** Fraction of the fuel energy entering the plant. */
  fraction: number;
  kind: 'thermal' | 'electrical' | 'loss';
  note: string;
}

export interface PlantEnergyChain {
  /** Net electrical output at the plant's terminals, MW. From the dispatch. */
  netMW: number;
  /** Gross electrical output, before the plant's own consumption. */
  grossMW: number;
  /** Fuel energy entering, MW thermal. */
  fuelMW: number;
  /** Net electrical efficiency, and the heat rate it is the same fact as. */
  efficiency: number;
  heatRateBtuPerKWh: number;
  /** Natural gas burned, in the units a gas contract is written in. */
  fuelMMBtuPerHour: number;
  /** Carbon dioxide produced, tonnes per hour. */
  co2TonnesPerHour: number;
  flows: EnergyFlow[];
  /** What is left after every named stream is subtracted. Must be ~0. */
  residualMW: number;
}

/**
 * Carbon intensity of natural gas combustion, kg CO₂ per MMBtu of fuel.
 *
 * Source: US EPA, Emission Factors for Greenhouse Gas Inventories, natural gas
 * (53.06 kg CO₂ per MMBtu). It is a property of the fuel's chemistry — burning
 * methane to carbon dioxide and water — and not of the plant, which is why an
 * efficient plant emits less per megawatt-hour but exactly the same per unit of
 * fuel.
 */
export const CO2_KG_PER_MMBTU = 53.06;

/**
 * Work the whole chain out from the plant's dispatched output.
 *
 * `netMW` comes from the solved case. Everything else follows from it and from
 * the heat rate, and the condenser stream is the remainder so that what goes in
 * equals what comes out exactly.
 */
export function energyChain(g: Generator, netMW: number): PlantEnergyChain {
  const heatRate = g.heatRateBtuPerKWh ?? 7300;
  const efficiency = BTU_PER_KWH / heatRate;
  const c = PLANT_CONFIG;

  const grossMW = netMW / (1 - c.auxiliaryFraction);
  const fuelMW = netMW / efficiency;

  const gtElecMW = grossMW * c.gasTurbineShare;
  const stElecMW = grossMW * (1 - c.gasTurbineShare);
  const gtShaftMW = gtElecMW / c.generatorEfficiency;
  const stShaftMW = stElecMW / c.generatorEfficiency;
  const radiationMW = fuelMW * c.radiationFraction;
  const exhaustMW = fuelMW - gtShaftMW - radiationMW;
  const stackMW = fuelMW * c.stackFraction;
  const steamMW = exhaustMW - stackMW;
  const generatorLossMW = (gtShaftMW - gtElecMW) + (stShaftMW - stElecMW);
  const auxMW = grossMW - netMW;
  // The remainder. Everything above is accounted for; this is what the cooling
  // tower has to get rid of, and computing it by subtraction is what makes the
  // chain close exactly rather than nearly.
  const condenserMW =
    fuelMW - gtElecMW - stElecMW - radiationMW - stackMW - generatorLossMW;

  const frac = (mw: number) => (fuelMW > 0 ? mw / fuelMW : 0);

  const flows: EnergyFlow[] = [
    {
      id: 'fuel', name: 'Natural gas in', mw: fuelMW, fraction: 1,
      kind: 'thermal',
      note:
        'Chemical energy arriving in a pipe. Everything below is what happens ' +
        'to it, and it all has to go somewhere.',
    },
    {
      id: 'gas-turbine', name: 'Gas turbine shaft work', mw: gtShaftMW,
      fraction: frac(gtShaftMW), kind: 'thermal',
      note:
        `${c.gasTurbines} machines. Air is compressed, fuel is burned in it, ` +
        'and the hot gas expands through a turbine on the same shaft as the ' +
        'compressor. Over half the turbine’s work goes straight back into ' +
        'driving that compressor; what is left turns the generator.',
    },
    {
      id: 'gt-generator', name: 'Gas turbine electrical output', mw: gtElecMW,
      fraction: frac(gtElecMW), kind: 'electrical',
      note: 'Two thirds of the station’s output, from the topping cycle.',
    },
    {
      id: 'exhaust', name: 'Exhaust to the boiler', mw: exhaustMW,
      fraction: frac(exhaustMW), kind: 'thermal',
      note:
        `Flue gas at about ${c.exhaustTempC} °C. In a simple-cycle plant all of ` +
        'this goes up the stack, which is why a simple-cycle machine is about ' +
        'thirty-eight per cent efficient and this is not.',
    },
    {
      id: 'hrsg', name: 'Steam raised', mw: steamMW,
      fraction: frac(steamMW), kind: 'thermal',
      note:
        `${c.steamBarG} bar, ${c.steamTempC} °C. A heat recovery steam ` +
        'generator has no burner of its own: it is a boiler heated entirely by ' +
        'somebody else’s waste.',
    },
    {
      id: 'stack', name: 'Up the stack', mw: stackMW,
      fraction: frac(stackMW), kind: 'loss',
      note:
        'What is left in the flue gas after the boiler has taken what it can. ' +
        'It cannot be driven to zero: cool the gas too far and the water vapour ' +
        'in it condenses into acid on the cold end of the boiler.',
    },
    {
      id: 'steam-turbine', name: 'Steam turbine shaft work', mw: stShaftMW,
      fraction: frac(stShaftMW), kind: 'thermal',
      note:
        'The steam expands from the boiler pressure down to a near vacuum in ' +
        `the condenser — about ${c.condenserMbar} millibar. It is the PRESSURE ` +
        'RATIO that does the work, so the vacuum at the cold end is worth as ' +
        'much as the pressure at the hot end.',
    },
    {
      id: 'st-generator', name: 'Steam turbine electrical output', mw: stElecMW,
      fraction: frac(stElecMW), kind: 'electrical',
      note: 'A third of the station’s output, from fuel that was already burned.',
    },
    {
      id: 'condenser', name: 'Rejected to the cooling tower', mw: condenserMW,
      fraction: frac(condenserMW), kind: 'loss',
      note:
        'The largest single stream leaving the plant, and it is unavoidable. A ' +
        'heat engine must reject heat to a cold reservoir — that is the second ' +
        'law of thermodynamics, not an engineering shortcoming — and this is ' +
        'that reservoir.',
    },
    {
      id: 'auxiliary', name: 'The plant’s own consumption', mw: auxMW,
      fraction: frac(auxMW), kind: 'loss',
      note:
        'Feedwater pumps, circulating water pumps, cooling tower fans, ' +
        'lighting, control systems. A large station is a substantial electrical ' +
        'load in its own right.',
    },
    {
      id: 'export', name: 'Exported to the grid', mw: netMW,
      fraction: frac(netMW), kind: 'electrical',
      note:
        'What leaves through the step-up transformers and appears in the power ' +
        'flow as this plant’s injection.',
    },
  ];

  const namedOut =
    gtElecMW + stElecMW + radiationMW + stackMW + generatorLossMW + condenserMW;

  return {
    netMW, grossMW, fuelMW,
    efficiency,
    heatRateBtuPerKWh: heatRate,
    fuelMMBtuPerHour: (fuelMW * 1000 * BTU_PER_KWH) / 1e6,
    co2TonnesPerHour:
      ((fuelMW * 1000 * BTU_PER_KWH) / 1e6) * CO2_KG_PER_MMBTU / 1000,
    flows,
    residualMW: fuelMW - namedOut,
  };
}

// ---------------------------------------------------------------------------
// The plant as a place
// ---------------------------------------------------------------------------

export type PlantItemKind =
  | 'gas-turbine' | 'hrsg' | 'stack' | 'steam-turbine' | 'condenser'
  | 'cooling-tower' | 'generator' | 'transformer' | 'switchyard' | 'fuel';

export interface PlantItem {
  id: string;
  kind: PlantItemKind;
  name: string;
  /** Metres east, north and above grade, from the south-west corner of the site. */
  at: [number, number, number];
  /** Footprint, metres, for the ones drawn as buildings rather than symbols. */
  sizeM?: [number, number];
  note: string;
  rating?: string;
  /** Which energy stream passes through it, for the live readouts. */
  stage?: EnergyStage;
}

/**
 * The layout.
 *
 * Schematic but plausible, and the honesty register says so. What is true about
 * it is the ORDER and the ADJACENCY: fuel arrives at one end, the gas turbines
 * sit in a row with their boilers directly behind them because the exhaust duct
 * has to be short, the steam turbine is central because both boilers feed it,
 * the condenser is directly under it, and the switchyard is at the far end
 * because that is where the lines leave.
 */
export const PLANT_SITE = { widthM: 260, depthM: 170 } as const;

export const PLANT_ITEMS: PlantItem[] = [
  {
    id: 'FUEL', kind: 'fuel', name: 'Gas metering and compression',
    at: [16, 28, 4], sizeM: [18, 14], stage: 'fuel',
    rating: 'Interstate pipeline tap, 60 bar',
    note:
      'Where the fuel arrives and is measured. The gas is compressed further ' +
      'before it reaches the burners, because a gas turbine burns fuel inside ' +
      'a compressor discharge at around twenty bar and the fuel has to get in ' +
      'against that pressure.',
  },
  {
    id: 'GT1', kind: 'gas-turbine', name: 'Gas turbine 1',
    at: [64, 34, 6], sizeM: [34, 16], stage: 'gas-turbine',
    rating: 'F-class, ~330 MW at site conditions',
    note:
      'A compressor, a set of combustors and a turbine on one shaft, in a ' +
      'building about the size of a large house. The first-stage blades run ' +
      'in gas hotter than the melting point of the alloy they are made of, and ' +
      'survive because cooling air is bled through channels inside them.',
  },
  {
    id: 'GT2', kind: 'gas-turbine', name: 'Gas turbine 2',
    at: [64, 96, 6], sizeM: [34, 16], stage: 'gas-turbine',
    rating: 'F-class, ~330 MW at site conditions',
    note: 'The second machine, identical to the first and independently operable.',
  },
  {
    id: 'HRSG1', kind: 'hrsg', name: 'Heat recovery steam generator 1',
    at: [118, 34, 14], sizeM: [30, 18], stage: 'hrsg',
    rating: 'Triple pressure with reheat',
    note:
      'A boiler with no burner. Flue gas from the turbine passes over banks of ' +
      'tubes at three different pressures, giving up its heat to water on the ' +
      'way to the stack. Three pressures rather than one because the gas cools ' +
      'as it goes and each stage can then be matched to the temperature ' +
      'available where it sits.',
  },
  {
    id: 'HRSG2', kind: 'hrsg', name: 'Heat recovery steam generator 2',
    at: [118, 96, 14], sizeM: [30, 18], stage: 'hrsg',
    note:
      'The second boiler. Both feed steam into the same header and therefore ' +
      'into the same steam turbine, which is what the "2×1" in the ' +
      'arrangement means.',
  },
  {
    id: 'STACK1', kind: 'stack', name: 'Stack 1',
    at: [150, 34, 45], stage: 'stack',
    rating: '45 m',
    note:
      'Where what the boiler could not use leaves. Tall enough to disperse the ' +
      'plume, not tall enough to matter thermodynamically.',
  },
  {
    id: 'STACK2', kind: 'stack', name: 'Stack 2',
    at: [150, 96, 45], stage: 'stack',
    rating: '45 m',
    note:
      'The second stack. Each train has its own, because each gas turbine and ' +
      'its boiler run independently of the other.',
  },
  {
    id: 'ST', kind: 'steam-turbine', name: 'Steam turbine',
    at: [96, 65, 8], sizeM: [40, 14], stage: 'steam-turbine',
    rating: '~340 MW, three casings',
    note:
      'High, intermediate and low pressure casings on one shaft. The steam ' +
      'enters at 124 bar and leaves into a vacuum, and the blades grow from a ' +
      'few centimetres long at the inlet to over a metre at the exhaust, ' +
      'because the same mass of steam occupies hundreds of times the volume by ' +
      'the time it gets there.',
  },
  {
    id: 'COND', kind: 'condenser', name: 'Condenser',
    at: [96, 65, -3], sizeM: [30, 10], stage: 'condenser',
    rating: '45 mbar absolute',
    note:
      'Directly underneath the low-pressure turbine, because the steam has to ' +
      'get there without losing the vacuum. Cooling water passes through tubes; ' +
      'steam condenses on the outside of them and the collapse in volume is ' +
      'what maintains the vacuum.',
  },
  {
    id: 'TOWER', kind: 'cooling-tower', name: 'Cooling tower',
    at: [96, 138, 18], sizeM: [48, 20], stage: 'condenser',
    rating: 'Mechanical draught, 8 cells',
    note:
      'Where the heat the condenser took out of the steam finally leaves, into ' +
      'the air. The visible plume is condensed water vapour, not smoke — the ' +
      'smoke, such as it is, leaves from the stacks and is invisible.',
  },
  {
    id: 'GEN_GT1', kind: 'generator', name: 'Gas turbine 1 generator',
    at: [40, 34, 5], stage: 'gt-generator',
    rating: '380 MVA, 18 kV, 3600 rpm',
    note:
      'Two poles, so it turns at 3,600 revolutions a minute to make 60 Hz. ' +
      'Hydrogen-cooled, because hydrogen has a seventh the density of air and ' +
      'therefore a fraction of the windage loss at that speed.',
  },
  {
    id: 'GEN_GT2', kind: 'generator', name: 'Gas turbine 2 generator',
    at: [40, 96, 5], stage: 'gt-generator',
    rating: '380 MVA, 18 kV, 3600 rpm',
    note:
      'The second gas turbine generator. Each machine synchronises to the ' +
      'system independently, so the station can run on one train while the ' +
      'other is opened up for a blade inspection.',
  },
  {
    id: 'GEN_ST', kind: 'generator', name: 'Steam turbine generator',
    at: [64, 65, 5], stage: 'st-generator',
    rating: '400 MVA, 18 kV, 3600 rpm',
    note:
      'The machine whose capability curve and swing equation are drawn one ' +
      'level down. It is the largest single rotating mass on this site.',
  },
  {
    id: 'GSU1', kind: 'transformer', name: 'Step-up transformer 1',
    at: [200, 34, 4], stage: 'export',
    rating: '380 MVA, 18/230 kV, 13 % Z, Dyn1',
    note:
      'A generator makes 18 kV because that is as high as you can insulate a ' +
      'rotating machine economically. The transformer takes it to 230 kV so ' +
      'the current — and with it the loss — is thirteen times smaller.',
  },
  {
    id: 'GSU2', kind: 'transformer', name: 'Step-up transformer 2',
    at: [200, 96, 4], stage: 'export',
    rating: '380 MVA, 18/230 kV, 13 % Z, Dyn1',
    note:
      'The second unit transformer. Each machine has its own, so a fault on ' +
      'one transformer takes out one machine rather than the station.',
  },
  {
    id: 'GSU_ST', kind: 'transformer', name: 'Steam turbine step-up transformer',
    at: [200, 65, 4], stage: 'export',
    rating: '400 MVA, 18/230 kV, 13 % Z, Dyn1',
    note: 'The steam turbine generator’s own transformer.',
  },
  {
    id: 'SWITCHYARD', kind: 'switchyard', name: '230 kV switchyard',
    at: [236, 65, 8], sizeM: [26, 90], stage: 'export',
    rating: '230 kV, breaker-and-a-half',
    note:
      'Where the plant becomes a bus in the power flow. Everything upstream of ' +
      'here is one generator as far as the solver is concerned; everything ' +
      'downstream is the network.',
  },
];

export const plantItemById = new Map(PLANT_ITEMS.map((i) => [i.id, i]));

/** How the energy moves between the items, for the drawing. */
export const PLANT_FLOWS: [string, string, EnergyStage][] = [
  ['FUEL', 'GT1', 'fuel'],
  ['FUEL', 'GT2', 'fuel'],
  ['GT1', 'GEN_GT1', 'gt-generator'],
  ['GT2', 'GEN_GT2', 'gt-generator'],
  ['GT1', 'HRSG1', 'exhaust'],
  ['GT2', 'HRSG2', 'exhaust'],
  ['HRSG1', 'STACK1', 'stack'],
  ['HRSG2', 'STACK2', 'stack'],
  ['HRSG1', 'ST', 'hrsg'],
  ['HRSG2', 'ST', 'hrsg'],
  ['ST', 'GEN_ST', 'st-generator'],
  ['ST', 'COND', 'condenser'],
  ['COND', 'TOWER', 'condenser'],
  ['GEN_GT1', 'GSU1', 'export'],
  ['GEN_GT2', 'GSU2', 'export'],
  ['GEN_ST', 'GSU_ST', 'export'],
  ['GSU1', 'SWITCHYARD', 'export'],
  ['GSU2', 'SWITCHYARD', 'export'],
  ['GSU_ST', 'SWITCHYARD', 'export'],
];
