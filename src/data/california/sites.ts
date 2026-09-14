/**
 * Named sites in the synthetic California network.
 *
 * Every coordinate is the real location of the place. Every electrical rating
 * is a plausible value for that class of installation, not the real one. See
 * docs/model.md for where each class of number comes from.
 */

export type RegionId = 'north' | 'bay' | 'central' | 'socal' | 'sandiego' | 'external';

export interface Region {
  id: RegionId;
  name: string;
  /** One line a beginner can read, no jargon. */
  blurb: string;
}

export const REGIONS: Region[] = [
  {
    id: 'north',
    name: 'Northern California',
    blurb:
      'Where power enters the state from the Pacific Northwest, plus geothermal ' +
      'steam at The Geysers and hydro out of the Cascades and Sierra foothills.',
  },
  {
    id: 'bay',
    name: 'Bay Area',
    blurb:
      'A dense load centre with little generation inside it. Most of what it ' +
      'uses arrives on long lines from elsewhere, which is why its supply is ' +
      'more fragile than its size suggests.',
  },
  {
    id: 'central',
    name: 'Central Valley & Sierra',
    blurb:
      'The corridor everything passes through. Solar farms on the valley floor, ' +
      'hydro in the mountains above, and the two transmission paths that carry ' +
      'power between the north and south halves of the state.',
  },
  {
    id: 'socal',
    name: 'Los Angeles Basin',
    blurb:
      'The largest concentration of demand in the state, ringed by gas plants, ' +
      'fed by imports from the desert southwest and wind from the mountain passes.',
  },
  {
    id: 'sandiego',
    name: 'San Diego & Imperial',
    blurb:
      'The end of the line. A load centre at the far southern corner, supplied ' +
      'through a narrow set of circuits and from geothermal and solar in the ' +
      'Imperial Valley.',
  },
  {
    id: 'external',
    name: 'Outside California',
    blurb:
      'The rest of the Western Interconnection. California is not an island: ' +
      'it is electrically bolted to everything from British Columbia to New Mexico.',
  },
];

export interface Site {
  id: string;
  /** Display name, as it would appear on a utility map. */
  name: string;
  lat: number;
  lon: number;
  region: RegionId;
  /** What kind of place this is, for the renderer. */
  kind: 'switchyard' | 'substation' | 'plant' | 'intertie' | 'city';
  /** One-line plain-language note shown on hover. */
  note: string;
}

export const SITES: Record<string, Site> = {
  // --- interties ---
  malin: { id: 'malin', name: 'Malin', lat: 42.00, lon: -121.40, region: 'external', kind: 'intertie',
    note: 'The Oregon border. Power from Columbia River dams arrives here on the 500 kV lines of the California–Oregon Intertie.' },
  paloverde: { id: 'paloverde', name: 'Palo Verde', lat: 33.39, lon: -112.86, region: 'external', kind: 'intertie',
    note: 'A switchyard in the Arizona desert. The gateway for power from the desert southwest.' },

  // --- north ---
  roundmtn: { id: 'roundmtn', name: 'Round Mountain', lat: 40.79, lon: -122.06, region: 'north', kind: 'switchyard',
    note: 'The northern hub. Everything arriving from Oregon funnels through here.' },
  geysers: { id: 'geysers', name: 'The Geysers', lat: 38.79, lon: -122.75, region: 'north', kind: 'plant',
    note: 'The largest geothermal field in the world. Steam comes straight out of the ground and turns turbines.' },
  tablemtn: { id: 'tablemtn', name: 'Table Mountain', lat: 39.53, lon: -121.55, region: 'north', kind: 'switchyard',
    note: 'The collection point for hydroelectric power coming down out of the northern Sierra.' },
  riooso: { id: 'riooso', name: 'Rio Oso', lat: 38.96, lon: -121.47, region: 'north', kind: 'substation',
    note: 'A Sacramento Valley junction between the northern hydro and the valley load.' },
  vaca: { id: 'vaca', name: 'Vaca–Dixon', lat: 38.40, lon: -121.90, region: 'north', kind: 'switchyard',
    note: 'Where the 500 kV backbone from the north meets the Bay Area and Sacramento.' },
  sacramento: { id: 'sacramento', name: 'Sacramento', lat: 38.58, lon: -121.49, region: 'north', kind: 'city',
    note: 'The state capital and the load centre of the northern valley.' },

  // --- bay ---
  tesla: { id: 'tesla', name: 'Tesla', lat: 37.73, lon: -121.55, region: 'bay', kind: 'switchyard',
    note: 'The eastern gate of the Bay Area. Named for the pass it sits in, not the car company.' },
  altamont: { id: 'altamont', name: 'Altamont Pass', lat: 37.73, lon: -121.65, region: 'bay', kind: 'plant',
    note: 'One of the first big wind farms anywhere. Wind funnels through the pass every afternoon.' },
  newark: { id: 'newark', name: 'Newark', lat: 37.53, lon: -122.03, region: 'bay', kind: 'substation',
    note: 'East bay industrial load and a crossing point of the bay.' },
  sanmateo: { id: 'sanmateo', name: 'San Mateo', lat: 37.55, lon: -122.30, region: 'bay', kind: 'substation',
    note: 'Peninsula load, and the route into San Francisco from the south.' },
  martin: { id: 'martin', name: 'Martin', lat: 37.69, lon: -122.42, region: 'bay', kind: 'substation',
    note: 'The substation that feeds San Francisco. The city has almost no generation of its own.' },
  oakland: { id: 'oakland', name: 'Oakland', lat: 37.80, lon: -122.27, region: 'bay', kind: 'city',
    note: 'East bay urban load.' },
  metcalf: { id: 'metcalf', name: 'Metcalf', lat: 37.18, lon: -121.72, region: 'bay', kind: 'switchyard',
    note: 'The southern gate of the Bay Area and the biggest substation in Silicon Valley.' },
  edenvale: { id: 'edenvale', name: 'Eden Vale', lat: 37.27, lon: -121.83, region: 'bay', kind: 'substation',
    note: 'A distribution substation in south San Jose. This is where the high-voltage network ends and the neighbourhood begins.' },
  mosslanding: { id: 'mosslanding', name: 'Moss Landing', lat: 36.80, lon: -121.78, region: 'bay', kind: 'plant',
    note: 'A coastal power plant site, now also home to one of the largest battery installations in the world.' },

  // --- central ---
  losbanos: { id: 'losbanos', name: 'Los Banos', lat: 37.06, lon: -120.85, region: 'central', kind: 'switchyard',
    note: 'The northern end of Path 15 — the transmission bottleneck that splits the state in two.' },
  gates: { id: 'gates', name: 'Gates', lat: 36.26, lon: -120.30, region: 'central', kind: 'switchyard',
    note: 'The southern end of Path 15, in the middle of the Central Valley solar belt.' },
  panoche: { id: 'panoche', name: 'Panoche', lat: 36.66, lon: -120.55, region: 'central', kind: 'substation',
    note: 'Valley solar collection point on the west side.' },
  midway: { id: 'midway', name: 'Midway', lat: 35.40, lon: -119.45, region: 'central', kind: 'switchyard',
    note: 'The northern end of Path 26, the second great north–south link.' },
  kern: { id: 'kern', name: 'Kern', lat: 35.37, lon: -119.02, region: 'central', kind: 'city',
    note: 'Bakersfield and the southern valley: oilfield load, farm pumping, and a great deal of solar.' },
  fresno: { id: 'fresno', name: 'Fresno', lat: 36.75, lon: -119.77, region: 'central', kind: 'city',
    note: 'The largest city in the valley. Agricultural pumping load that swings hard with the season.' },
  helms: { id: 'helms', name: 'Helms', lat: 37.05, lon: -118.95, region: 'central', kind: 'plant',
    note: 'A pumped-storage plant buried inside a mountain. It pumps water uphill when power is cheap and runs it back down when power is dear.' },
  bigcreek: { id: 'bigcreek', name: 'Big Creek', lat: 37.20, lon: -119.24, region: 'central', kind: 'plant',
    note: 'A chain of hydroelectric plants stepping down the Sierra, built a century ago.' },
  diablo: { id: 'diablo', name: 'Diablo Canyon', lat: 35.21, lon: -120.85, region: 'central', kind: 'plant',
    note: 'The state’s nuclear plant. It runs flat out, all the time, and does not follow demand.' },
  morrobay: { id: 'morrobay', name: 'Morro Bay', lat: 35.37, lon: -120.86, region: 'central', kind: 'substation',
    note: 'A central-coast junction and former power plant site.' },

  // --- socal ---
  whirlwind: { id: 'whirlwind', name: 'Whirlwind', lat: 34.90, lon: -118.35, region: 'socal', kind: 'switchyard',
    note: 'The Tehachapi collector. Thousands of megawatts of wind gather here before heading to Los Angeles.' },
  vincent: { id: 'vincent', name: 'Vincent', lat: 34.51, lon: -118.11, region: 'socal', kind: 'switchyard',
    note: 'The northern doorway into the Los Angeles basin, at the top of the mountains.' },
  sylmar: { id: 'sylmar', name: 'Sylmar', lat: 34.31, lon: -118.48, region: 'socal', kind: 'switchyard',
    note: 'The southern terminus of a direct-current line that runs 1,360 km from the Columbia River.' },
  rinaldi: { id: 'rinaldi', name: 'Rinaldi', lat: 34.28, lon: -118.50, region: 'socal', kind: 'substation',
    note: 'San Fernando Valley load.' },
  haynes: { id: 'haynes', name: 'Haynes', lat: 33.76, lon: -118.10, region: 'socal', kind: 'plant',
    note: 'A gas-fired plant on the Long Beach waterfront, close to the load it serves.' },
  miraloma: { id: 'miraloma', name: 'Mira Loma', lat: 34.02, lon: -117.53, region: 'socal', kind: 'switchyard',
    note: 'The eastern hub of the Los Angeles basin.' },
  lugo: { id: 'lugo', name: 'Lugo', lat: 34.47, lon: -117.35, region: 'socal', kind: 'switchyard',
    note: 'High desert switchyard on the route from the Southwest.' },
  serrano: { id: 'serrano', name: 'Serrano', lat: 33.85, lon: -117.68, region: 'socal', kind: 'switchyard',
    note: 'Orange County’s main supply point.' },
  valley: { id: 'valley', name: 'Valley', lat: 33.73, lon: -117.15, region: 'socal', kind: 'switchyard',
    note: 'Inland Empire hub, and the link toward San Diego.' },
  devers: { id: 'devers', name: 'Devers', lat: 33.92, lon: -116.57, region: 'socal', kind: 'switchyard',
    note: 'Where power from Arizona arrives, next to the wind farms of the San Gorgonio Pass.' },
  sangorgonio: { id: 'sangorgonio', name: 'San Gorgonio Pass', lat: 33.92, lon: -116.70, region: 'socal', kind: 'plant',
    note: 'A wind farm in a gap between two ten-thousand-foot mountains, which makes it one of the windiest places in the country.' },

  // --- san diego ---
  sanonofre: { id: 'sanonofre', name: 'San Onofre', lat: 33.37, lon: -117.55, region: 'sandiego', kind: 'switchyard',
    note: 'A coastal switchyard, and the electrical hinge between Los Angeles and San Diego.' },
  escondido: { id: 'escondido', name: 'Escondido', lat: 33.12, lon: -117.09, region: 'sandiego', kind: 'substation',
    note: 'North San Diego County load.' },
  miguel: { id: 'miguel', name: 'Miguel', lat: 32.67, lon: -116.94, region: 'sandiego', kind: 'switchyard',
    note: 'San Diego’s main gateway, on a hill east of the city.' },
  imperialvalley: { id: 'imperialvalley', name: 'Imperial Valley', lat: 32.72, lon: -115.57, region: 'sandiego', kind: 'switchyard',
    note: 'Desert switchyard beside the Salton Sea, ringed by geothermal and solar plants.' },
  sandiego: { id: 'sandiego', name: 'San Diego', lat: 32.72, lon: -117.16, region: 'sandiego', kind: 'city',
    note: 'The city load itself.' },
};
