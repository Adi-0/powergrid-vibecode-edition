import type { ConstructionId } from '../towers';
import type { SourceId } from '../sources';

/**
 * The synthetic California transmission network.
 *
 * Named after real places so the geography is recognisable; NOT a replica of any
 * real asset, rating or flow. It is built to capture the real structure: the
 * north–south 500 kV backbone (the California–Oregon Intertie in the north, Path 15
 * through the Central Valley, Path 26 over the Tehachapis), Sierra hydro, Central
 * Valley and desert solar, wind in the passes (Altamont, Solano, Tehachapi, San
 * Gorgonio), geothermal at The Geysers and the Salton Sea, coastal gas, nuclear on
 * the Central Coast, the Bay Area and Los Angeles Basin load centres, and imports
 * from the Northwest (AC and the Pacific DC Intertie) and the Southwest.
 *
 * Sites are substations or plants. Each site has buses at one or more voltage
 * levels (the bus id is SITE-kV); transformers join levels inside a site; lines
 * join sites at one level. Line impedances are not typed in: they are computed from
 * the construction (tower geometry and conductor) and the route length.
 */

export type RegionId = 'north' | 'bay' | 'central' | 'coast' | 'la' | 'inland' | 'sd' | 'tie';

export const REGIONS: Record<RegionId, { name: string; plain: string }> = {
  north: { name: 'North State & Sacramento', plain: 'Sierra and Cascade hydro, the Oregon intertie, and the capital’s load.' },
  bay: { name: 'San Francisco Bay Area', plain: 'A dense load centre ringed by 230 kV lines, fed from the Central Valley backbone.' },
  central: { name: 'Central Valley & Sierra', plain: 'The 500 kV backbone, Valley solar, Sierra hydro and pumped storage.' },
  coast: { name: 'Central Coast', plain: 'Nuclear and gas on the coast, solar on the Carrizo Plain.' },
  la: { name: 'Los Angeles Basin', plain: 'The largest load centre, fed over the Tehachapis and from the east.' },
  inland: { name: 'Inland Empire & Deserts', plain: 'Wind in the passes, desert solar, and the ties to Nevada and Arizona.' },
  sd: { name: 'San Diego & Imperial', plain: 'A load pocket at the end of the line, with geothermal and solar in the Imperial Valley.' },
  tie: { name: 'Interties', plain: 'Where California’s grid meets its neighbours’.' },
};

export interface Site {
  id: string;
  name: string;
  lat: number;
  lon: number;
  /** Voltage levels present, kV line-to-line. */
  kv: number[];
  region: RegionId;
  /** Outside California (an intertie point in a neighbouring state). */
  outOfState?: string;
  plain?: string;
}

export const SITES: Site[] = [
  // ---------------------------------------------------------------- north
  { id: 'MALIN', name: 'Malin', lat: 42.013, lon: -121.408, kv: [500], region: 'tie', outOfState: 'Oregon', plain: 'Where the California–Oregon Intertie brings Northwest hydro south.' },
  { id: 'ROUND_MTN', name: 'Round Mountain', lat: 40.793, lon: -121.932, kv: [500, 230], region: 'north' },
  { id: 'PIT_RIVER', name: 'Pit River', lat: 40.99, lon: -121.96, kv: [230], region: 'north', plain: 'A staircase of hydro powerhouses on the Pit River.' },
  { id: 'COTTONWOOD', name: 'Cottonwood', lat: 40.388, lon: -122.283, kv: [230, 115], region: 'north' },
  { id: 'HUMBOLDT', name: 'Humboldt', lat: 40.742, lon: -124.21, kv: [115], region: 'north', plain: 'The far North Coast, reached only over long 115 kV lines.' },
  { id: 'TABLE_MTN', name: 'Table Mountain', lat: 39.636, lon: -121.557, kv: [500, 230], region: 'north' },
  { id: 'ELVERTA', name: 'Elverta (Sacramento)', lat: 38.717, lon: -121.462, kv: [230], region: 'north' },
  { id: 'RANCHO_SECO', name: 'Rancho Seco', lat: 38.34, lon: -121.12, kv: [230], region: 'north' },
  { id: 'VACA_DIXON', name: 'Vaca-Dixon', lat: 38.405, lon: -121.915, kv: [500, 230], region: 'bay' },
  { id: 'GEYSERS', name: 'The Geysers', lat: 38.79, lon: -122.76, kv: [230], region: 'bay', plain: 'The world’s largest geothermal field.' },
  { id: 'LAKEVILLE', name: 'Lakeville (Petaluma)', lat: 38.2, lon: -122.57, kv: [230], region: 'bay' },
  { id: 'CONTRA_COSTA', name: 'Contra Costa', lat: 38.017, lon: -121.838, kv: [230], region: 'bay' },
  { id: 'TESLA', name: 'Tesla', lat: 37.703, lon: -121.558, kv: [500, 230], region: 'bay' },
  { id: 'MORAGA', name: 'Moraga (East Bay)', lat: 37.838, lon: -122.128, kv: [230], region: 'bay' },
  { id: 'MARTIN', name: 'Martin (San Francisco)', lat: 37.712, lon: -122.418, kv: [230], region: 'bay' },
  { id: 'RAVENSWOOD', name: 'Ravenswood (Peninsula)', lat: 37.478, lon: -122.138, kv: [230], region: 'bay' },
  { id: 'NEWARK', name: 'Newark', lat: 37.525, lon: -122.025, kv: [230], region: 'bay' },
  { id: 'METCALF', name: 'Metcalf (San José)', lat: 37.228, lon: -121.748, kv: [500, 230, 60], region: 'bay' },
  { id: 'EVERGREEN', name: 'Evergreen', lat: 37.31, lon: -121.79, kv: [60], region: 'bay', plain: 'A neighbourhood distribution substation in east San José.' },
  { id: 'MOSS_LANDING', name: 'Moss Landing', lat: 36.805, lon: -121.782, kv: [500, 230], region: 'coast', plain: 'A coastal gas plant and one of the largest batteries in the world.' },
  { id: 'BELLOTA', name: 'Bellota (Stockton)', lat: 38.045, lon: -121.055, kv: [230], region: 'central' },
  { id: 'LOS_BANOS', name: 'Los Banos', lat: 37.03, lon: -120.867, kv: [500], region: 'central' },
  { id: 'HERNDON', name: 'Herndon (Fresno)', lat: 36.838, lon: -119.827, kv: [230], region: 'central' },
  { id: 'HELMS', name: 'Helms', lat: 37.04, lon: -118.965, kv: [230], region: 'central', plain: 'Pumped storage deep inside a Sierra mountain.' },
  { id: 'WESTLANDS', name: 'Westlands', lat: 36.45, lon: -120.25, kv: [500, 230], region: 'central', plain: 'Retired farmland on the west side of the Valley, now covered in solar.' },
  { id: 'GATES', name: 'Gates', lat: 36.135, lon: -120.115, kv: [500, 230], region: 'central' },
  { id: 'DIABLO', name: 'Diablo Canyon', lat: 35.212, lon: -120.855, kv: [500], region: 'coast', plain: 'California’s last nuclear plant.' },
  { id: 'CARRIZO', name: 'Carrizo Plain', lat: 35.38, lon: -120.07, kv: [230], region: 'coast' },
  { id: 'MIDWAY', name: 'Midway', lat: 35.335, lon: -119.475, kv: [500, 230], region: 'central', plain: 'The hub at the south end of the Valley where Path 26 begins.' },
  { id: 'MAGUNDEN', name: 'Magunden (Bakersfield)', lat: 35.37, lon: -118.95, kv: [230], region: 'central' },
  { id: 'BIG_CREEK', name: 'Big Creek', lat: 37.205, lon: -119.245, kv: [230], region: 'central' },
  // ---------------------------------------------------------------- south
  { id: 'WINDHUB', name: 'Windhub (Tehachapi)', lat: 35.06, lon: -118.3, kv: [500], region: 'inland', plain: 'Where Tehachapi Pass wind and Antelope Valley solar meet the 500 kV system.' },
  { id: 'ANTELOPE', name: 'Antelope (Lancaster)', lat: 34.69, lon: -118.27, kv: [500, 230], region: 'inland' },
  { id: 'VINCENT', name: 'Vincent', lat: 34.485, lon: -118.115, kv: [500, 230], region: 'la', plain: 'The south end of Path 26, gateway to the Los Angeles Basin.' },
  { id: 'SYLMAR', name: 'Sylmar', lat: 34.311, lon: -118.487, kv: [230], region: 'la', plain: 'Southern terminal of the Pacific DC Intertie from Oregon.' },
  { id: 'MOORPARK', name: 'Moorpark (Ventura)', lat: 34.285, lon: -118.905, kv: [230], region: 'la' },
  { id: 'GOLETA', name: 'Goleta (Santa Barbara)', lat: 34.435, lon: -119.828, kv: [230], region: 'la', plain: 'Santa Barbara hangs off two lines along the coast.' },
  { id: 'SCATTERGOOD', name: 'Scattergood (El Segundo)', lat: 33.918, lon: -118.428, kv: [230], region: 'la' },
  { id: 'LAGUNA_BELL', name: 'Laguna Bell (Los Angeles)', lat: 33.978, lon: -118.16, kv: [230], region: 'la' },
  { id: 'HAYNES', name: 'Haynes (Long Beach)', lat: 33.762, lon: -118.1, kv: [230], region: 'la' },
  { id: 'LUGO', name: 'Lugo', lat: 34.368, lon: -117.366, kv: [500], region: 'inland' },
  { id: 'MIRA_LOMA', name: 'Mira Loma', lat: 33.988, lon: -117.552, kv: [500, 230], region: 'inland' },
  { id: 'VISTA', name: 'Vista (San Bernardino)', lat: 34.065, lon: -117.3, kv: [230], region: 'inland' },
  { id: 'SERRANO', name: 'Serrano', lat: 33.83, lon: -117.7, kv: [500, 230], region: 'la' },
  { id: 'BARRE', name: 'Barre (Orange County)', lat: 33.81, lon: -117.985, kv: [230], region: 'la' },
  { id: 'SANTIAGO', name: 'Santiago (Irvine)', lat: 33.713, lon: -117.747, kv: [230], region: 'la' },
  { id: 'DEVERS', name: 'Devers (Palm Springs)', lat: 33.935, lon: -116.58, kv: [500, 230], region: 'inland' },
  { id: 'COLORADO_RIVER', name: 'Colorado River (Blythe)', lat: 33.63, lon: -114.68, kv: [500], region: 'inland' },
  { id: 'PALO_VERDE', name: 'Palo Verde', lat: 33.39, lon: -112.86, kv: [500], region: 'tie', outOfState: 'Arizona', plain: 'The Desert Southwest hub.' },
  { id: 'ELDORADO', name: 'Eldorado', lat: 35.795, lon: -114.98, kv: [500], region: 'tie', outOfState: 'Nevada', plain: 'Near Hoover Dam and Las Vegas.' },
  { id: 'SAN_ONOFRE', name: 'San Onofre', lat: 33.37, lon: -117.555, kv: [230], region: 'sd' },
  { id: 'ENCINA', name: 'Encina (Carlsbad)', lat: 33.14, lon: -117.335, kv: [230], region: 'sd' },
  { id: 'SYCAMORE', name: 'Sycamore Canyon', lat: 32.935, lon: -117.02, kv: [230], region: 'sd' },
  { id: 'MISSION', name: 'Mission (San Diego)', lat: 32.78, lon: -117.14, kv: [230], region: 'sd' },
  { id: 'OTAY_MESA', name: 'Otay Mesa', lat: 32.573, lon: -116.93, kv: [230], region: 'sd' },
  { id: 'MIGUEL', name: 'Miguel', lat: 32.692, lon: -116.868, kv: [500, 230], region: 'sd' },
  { id: 'IMPERIAL_VALLEY', name: 'Imperial Valley', lat: 32.72, lon: -115.88, kv: [500, 230], region: 'sd' },
];

export interface LineRecord {
  from: string;
  to: string;
  kv: number;
  circuits: number;
  construction: ConstructionId;
  /** Route length, km. If omitted: great-circle distance × routeFactor. */
  lengthKm?: number;
  /** Terrain factor on the straight-line distance (default 1.15). */
  routeFactor?: number;
  /** Continuous rating per circuit, MVA, when terminal equipment limits below the conductor. */
  rateMVA?: number;
  name?: string;
  note?: string;
  src: SourceId;
}

// Broadly N-1 secure at the evening peak (judged against emergency ratings), with
// deliberately tight corridors so overloads and collapse are discoverable:
//  * San Diego's imports: the Southwest Powerlink (Palo Verde → Imperial Valley) and
//    Path 44 (Santiago → San Onofre → Encina). Lose Path 44's partner circuit at peak
//    and the survivor goes past its emergency rating; lose the Southwest Powerlink and
//    no operating point exists.
//  * Santa Barbara (Moorpark → Goleta): two 230 kV circuits limited by old terminal
//    equipment; lose one at peak and the other goes past its emergency rating.
//  * Path 26 (Midway → Vincent/Windhub): three 500 kV circuits; secure for one outage,
//    not for two.
export const LINES: LineRecord[] = [
  // ---------------------------------------------------------------- 500 kV
  { from: 'MALIN', to: 'ROUND_MTN', kv: 500, circuits: 2, construction: 'EHV500', name: 'California–Oregon Intertie', src: 'estimate' },
  { from: 'MALIN', to: 'TABLE_MTN', kv: 500, circuits: 1, construction: 'EHV500', routeFactor: 1.2, name: 'California–Oregon Transmission Project', src: 'estimate' },
  { from: 'ROUND_MTN', to: 'TABLE_MTN', kv: 500, circuits: 2, construction: 'EHV500', src: 'estimate' },
  { from: 'TABLE_MTN', to: 'VACA_DIXON', kv: 500, circuits: 1, construction: 'EHV500', src: 'estimate' },
  { from: 'TABLE_MTN', to: 'TESLA', kv: 500, circuits: 1, construction: 'EHV500', src: 'estimate' },
  { from: 'VACA_DIXON', to: 'TESLA', kv: 500, circuits: 1, construction: 'EHV500', src: 'estimate' },
  { from: 'TESLA', to: 'METCALF', kv: 500, circuits: 1, construction: 'EHV500', src: 'estimate' },
  { from: 'TESLA', to: 'LOS_BANOS', kv: 500, circuits: 2, construction: 'EHV500', src: 'estimate' },
  { from: 'METCALF', to: 'MOSS_LANDING', kv: 500, circuits: 1, construction: 'EHV500', src: 'estimate' },
  { from: 'MOSS_LANDING', to: 'LOS_BANOS', kv: 500, circuits: 2, construction: 'EHV500', routeFactor: 1.25, src: 'estimate' },
  { from: 'LOS_BANOS', to: 'GATES', kv: 500, circuits: 1, construction: 'EHV500', name: 'Path 15', src: 'estimate' },
  { from: 'LOS_BANOS', to: 'WESTLANDS', kv: 500, circuits: 1, construction: 'EHV500', name: 'Path 15', src: 'estimate' },
  { from: 'WESTLANDS', to: 'GATES', kv: 500, circuits: 1, construction: 'EHV500', src: 'estimate' },
  { from: 'LOS_BANOS', to: 'MIDWAY', kv: 500, circuits: 1, construction: 'EHV500', name: 'Path 15', src: 'estimate' },
  { from: 'GATES', to: 'MIDWAY', kv: 500, circuits: 2, construction: 'EHV500', src: 'estimate' },
  { from: 'GATES', to: 'DIABLO', kv: 500, circuits: 1, construction: 'EHV500', routeFactor: 1.25, src: 'estimate' },
  { from: 'DIABLO', to: 'MIDWAY', kv: 500, circuits: 2, construction: 'EHV500', routeFactor: 1.25, src: 'estimate' },
  { from: 'MIDWAY', to: 'VINCENT', kv: 500, circuits: 2, construction: 'EHV500', routeFactor: 1.3, name: 'Path 26', src: 'estimate' },
  { from: 'MIDWAY', to: 'WINDHUB', kv: 500, circuits: 1, construction: 'EHV500', routeFactor: 1.3, name: 'Path 26', src: 'estimate' },
  { from: 'WINDHUB', to: 'VINCENT', kv: 500, circuits: 2, construction: 'EHV500', src: 'estimate' },
  { from: 'WINDHUB', to: 'ANTELOPE', kv: 500, circuits: 1, construction: 'EHV500', src: 'estimate' },
  { from: 'ANTELOPE', to: 'VINCENT', kv: 500, circuits: 1, construction: 'EHV500', src: 'estimate' },
  { from: 'VINCENT', to: 'LUGO', kv: 500, circuits: 1, construction: 'EHV500', src: 'estimate' },
  { from: 'VINCENT', to: 'MIRA_LOMA', kv: 500, circuits: 1, construction: 'EHV500', routeFactor: 1.25, src: 'estimate' },
  { from: 'LUGO', to: 'MIRA_LOMA', kv: 500, circuits: 2, construction: 'EHV500', routeFactor: 1.2, src: 'estimate' },
  { from: 'LUGO', to: 'ELDORADO', kv: 500, circuits: 2, construction: 'EHV500', name: 'Eldorado–Lugo', src: 'estimate' },
  { from: 'MIRA_LOMA', to: 'SERRANO', kv: 500, circuits: 2, construction: 'EHV500', src: 'estimate' },
  { from: 'SERRANO', to: 'DEVERS', kv: 500, circuits: 1, construction: 'EHV500', routeFactor: 1.2, src: 'estimate' },
  { from: 'MIRA_LOMA', to: 'DEVERS', kv: 500, circuits: 2, construction: 'EHV500', routeFactor: 1.2, src: 'estimate' },
  { from: 'DEVERS', to: 'COLORADO_RIVER', kv: 500, circuits: 3, construction: 'EHV500', name: 'West of River', src: 'estimate' },
  { from: 'COLORADO_RIVER', to: 'PALO_VERDE', kv: 500, circuits: 2, construction: 'EHV500', name: 'Devers–Palo Verde', src: 'estimate' },
  { from: 'PALO_VERDE', to: 'IMPERIAL_VALLEY', kv: 500, circuits: 1, construction: 'EHV500', lengthKm: 280, name: 'Southwest Powerlink', src: 'estimate' },
  { from: 'IMPERIAL_VALLEY', to: 'MIGUEL', kv: 500, circuits: 2, construction: 'EHV500', routeFactor: 1.2, name: 'Sunrise / SWPL', src: 'estimate' },
  // ---------------------------------------------------------------- 230 kV north & bay
  { from: 'ROUND_MTN', to: 'PIT_RIVER', kv: 230, circuits: 2, construction: 'HV230_2B', src: 'estimate' },
  { from: 'ROUND_MTN', to: 'COTTONWOOD', kv: 230, circuits: 2, construction: 'HV230_2B', src: 'estimate' },
  { from: 'COTTONWOOD', to: 'TABLE_MTN', kv: 230, circuits: 1, construction: 'HV230_2B', src: 'estimate' },
  { from: 'COTTONWOOD', to: 'VACA_DIXON', kv: 230, circuits: 1, construction: 'HV230_2B', src: 'estimate' },
  { from: 'TABLE_MTN', to: 'ELVERTA', kv: 230, circuits: 3, construction: 'HV230_2B', src: 'estimate' },
  { from: 'ELVERTA', to: 'RANCHO_SECO', kv: 230, circuits: 2, construction: 'HV230_2B', src: 'estimate' },
  { from: 'ELVERTA', to: 'VACA_DIXON', kv: 230, circuits: 3, construction: 'HV230_2B', src: 'estimate' },
  { from: 'RANCHO_SECO', to: 'BELLOTA', kv: 230, circuits: 1, construction: 'HV230_2B', src: 'estimate' },
  { from: 'VACA_DIXON', to: 'LAKEVILLE', kv: 230, circuits: 2, construction: 'HV230_2B', src: 'estimate' },
  { from: 'LAKEVILLE', to: 'GEYSERS', kv: 230, circuits: 2, construction: 'HV230_2B', routeFactor: 1.3, src: 'estimate' },
  { from: 'GEYSERS', to: 'VACA_DIXON', kv: 230, circuits: 1, construction: 'HV230_2B', routeFactor: 1.3, src: 'estimate' },
  { from: 'VACA_DIXON', to: 'CONTRA_COSTA', kv: 230, circuits: 2, construction: 'HV230_2B', src: 'estimate' },
  { from: 'LAKEVILLE', to: 'MORAGA', kv: 230, circuits: 1, construction: 'HV230_2B', src: 'estimate' },
  { from: 'CONTRA_COSTA', to: 'MORAGA', kv: 230, circuits: 3, construction: 'HV230_2B', src: 'estimate' },
  { from: 'CONTRA_COSTA', to: 'TESLA', kv: 230, circuits: 1, construction: 'HV230_2B', src: 'estimate' },
  { from: 'MORAGA', to: 'NEWARK', kv: 230, circuits: 1, construction: 'HV230_2B', src: 'estimate' },
  { from: 'TESLA', to: 'NEWARK', kv: 230, circuits: 3, construction: 'HV230_2B', src: 'estimate' },
  { from: 'NEWARK', to: 'RAVENSWOOD', kv: 230, circuits: 3, construction: 'HV230_2B', src: 'estimate' },
  { from: 'RAVENSWOOD', to: 'MARTIN', kv: 230, circuits: 2, construction: 'HV230_2B', src: 'estimate' },
  { from: 'NEWARK', to: 'METCALF', kv: 230, circuits: 2, construction: 'HV230_2B', src: 'estimate' },
  { from: 'RAVENSWOOD', to: 'METCALF', kv: 230, circuits: 2, construction: 'HV230_2B', src: 'estimate' },
  { from: 'METCALF', to: 'MOSS_LANDING', kv: 230, circuits: 3, construction: 'HV230_2B', src: 'estimate' },
  { from: 'TESLA', to: 'BELLOTA', kv: 230, circuits: 1, construction: 'HV230_2B', src: 'estimate' },
  // ---------------------------------------------------------------- 230 kV valley & coast
  { from: 'BELLOTA', to: 'HERNDON', kv: 230, circuits: 2, construction: 'HV230_2B', src: 'estimate' },
  { from: 'HERNDON', to: 'HELMS', kv: 230, circuits: 3, construction: 'HV230_2B', routeFactor: 1.35, src: 'estimate' },
  { from: 'HERNDON', to: 'GATES', kv: 230, circuits: 2, construction: 'HV230_2B', src: 'estimate' },
  { from: 'WESTLANDS', to: 'GATES', kv: 230, circuits: 2, construction: 'HV230_2B', src: 'estimate' },
  { from: 'WESTLANDS', to: 'HERNDON', kv: 230, circuits: 2, construction: 'HV230_2B', src: 'estimate' },
  { from: 'GATES', to: 'MIDWAY', kv: 230, circuits: 1, construction: 'HV230_2B', src: 'estimate' },
  { from: 'CARRIZO', to: 'MIDWAY', kv: 230, circuits: 2, construction: 'HV230_2B', src: 'estimate' },
  { from: 'MIDWAY', to: 'MAGUNDEN', kv: 230, circuits: 2, construction: 'HV230_2B', src: 'estimate' },
  { from: 'MAGUNDEN', to: 'BIG_CREEK', kv: 230, circuits: 2, construction: 'HV230_2B', routeFactor: 1.25, src: 'estimate' },
  { from: 'BIG_CREEK', to: 'HERNDON', kv: 230, circuits: 2, construction: 'HV230_2B', routeFactor: 1.3, src: 'estimate' },
  { from: 'MAGUNDEN', to: 'VINCENT', kv: 230, circuits: 1, construction: 'HV230_2B', routeFactor: 1.3, name: 'Big Creek–Pastoria corridor', src: 'estimate' },
  // ---------------------------------------------------------------- 115 kV North Coast
  { from: 'COTTONWOOD', to: 'HUMBOLDT', kv: 115, circuits: 2, construction: 'HV115', routeFactor: 1.35, src: 'estimate' },
  // ---------------------------------------------------------------- 230 kV south
  { from: 'ANTELOPE', to: 'VINCENT', kv: 230, circuits: 2, construction: 'HV230_2B', src: 'estimate' },
  { from: 'VINCENT', to: 'SYLMAR', kv: 230, circuits: 2, construction: 'HV230_2B', src: 'estimate' },
  { from: 'VINCENT', to: 'MOORPARK', kv: 230, circuits: 2, construction: 'HV230_2B', src: 'estimate' },
  { from: 'SYLMAR', to: 'MOORPARK', kv: 230, circuits: 2, construction: 'HV230_2B', src: 'estimate' },
  // Deliberately tight #3: the Southwest Powerlink (Palo Verde → Imperial Valley) carries
  // much of San Diego's evening import; losing it at the peak leaves no operating point.
  {
    from: 'MOORPARK',
    to: 'GOLETA',
    kv: 230,
    circuits: 2,
    construction: 'HV230_1',
    rateMVA: 250,
    name: 'Santa Clara–Goleta',
    note: 'Terminal equipment limits each circuit below its conductor rating: a deliberately tight radial pair.',
    src: 'estimate',
  },
  { from: 'SYLMAR', to: 'SCATTERGOOD', kv: 230, circuits: 3, construction: 'HV230_2B', src: 'estimate' },
  { from: 'SYLMAR', to: 'LAGUNA_BELL', kv: 230, circuits: 2, construction: 'HV230_2B', src: 'estimate' },
  { from: 'VINCENT', to: 'LAGUNA_BELL', kv: 230, circuits: 3, construction: 'HV230_2B', routeFactor: 1.25, src: 'estimate' },
  { from: 'LAGUNA_BELL', to: 'HAYNES', kv: 230, circuits: 2, construction: 'HV230_2B', src: 'estimate' },
  { from: 'SCATTERGOOD', to: 'HAYNES', kv: 230, circuits: 1, construction: 'HV230_2B', src: 'estimate' },
  { from: 'LAGUNA_BELL', to: 'MIRA_LOMA', kv: 230, circuits: 2, construction: 'HV230_2B', src: 'estimate' },
  { from: 'HAYNES', to: 'BARRE', kv: 230, circuits: 2, construction: 'HV230_2B', src: 'estimate' },
  { from: 'BARRE', to: 'SERRANO', kv: 230, circuits: 2, construction: 'HV230_2B', src: 'estimate' },
  { from: 'SERRANO', to: 'SANTIAGO', kv: 230, circuits: 4, construction: 'HV230_2B', src: 'estimate' },
  { from: 'MIRA_LOMA', to: 'VISTA', kv: 230, circuits: 2, construction: 'HV230_2B', src: 'estimate' },
  { from: 'VISTA', to: 'DEVERS', kv: 230, circuits: 2, construction: 'HV230_2B', routeFactor: 1.2, src: 'estimate' },
  { from: 'MIRA_LOMA', to: 'SERRANO', kv: 230, circuits: 2, construction: 'HV230_2B', src: 'estimate' },
  { from: 'SANTIAGO', to: 'SAN_ONOFRE', kv: 230, circuits: 2, construction: 'HV230_2B', name: 'Path 44', src: 'estimate' },
  { from: 'SAN_ONOFRE', to: 'ENCINA', kv: 230, circuits: 2, construction: 'HV230_2B', name: 'Path 44', src: 'estimate' },
  { from: 'ENCINA', to: 'MISSION', kv: 230, circuits: 1, construction: 'HV230_2B', src: 'estimate' },
  { from: 'ENCINA', to: 'SYCAMORE', kv: 230, circuits: 1, construction: 'HV230_2B', src: 'estimate' },
  { from: 'SYCAMORE', to: 'MISSION', kv: 230, circuits: 2, construction: 'HV230_2B', src: 'estimate' },
  { from: 'MISSION', to: 'MIGUEL', kv: 230, circuits: 2, construction: 'HV230_2B', src: 'estimate' },
  { from: 'SYCAMORE', to: 'MIGUEL', kv: 230, circuits: 2, construction: 'HV230_2B', src: 'estimate' },
  { from: 'MIGUEL', to: 'OTAY_MESA', kv: 230, circuits: 2, construction: 'HV230_2B', src: 'estimate' },
  { from: 'OTAY_MESA', to: 'MISSION', kv: 230, circuits: 1, construction: 'HV230_2B', src: 'estimate' },
  // ---------------------------------------------------------------- 60 kV subtransmission (the modelled path)
  { from: 'METCALF', to: 'EVERGREEN', kv: 60, circuits: 3, construction: 'SUB60', lengthKm: 11.5, src: 'estimate' },
];

export interface TransformerRecord {
  site: string;
  hvKV: number;
  lvKV: number;
  banks: number;
  /** Rating per bank, MVA. */
  mva: number;
  /** Leakage reactance, % on the bank's own MVA base, and X/R ratio. */
  xPct: number;
  xr: number;
  /** Winding connection per IEEE C57.12.00 notation, and neutral grounding. */
  vectorGroup: string;
  /**
   * The delta tertiary's line-to-line voltage, kV: a typical value (estimate), used only
   * to draw its turns; the tertiary carries no load in this model.
   */
  tertiaryKV?: number;
  plain?: string;
  src: SourceId;
}

// 500/230 kV banks are autotransformers (YNa0 with a delta tertiary). 230/60 and
// 230/115 kV banks are grounded-wye/grounded-wye with a delta tertiary.
const AUTO = { xPct: 10, xr: 50, vectorGroup: 'YNa0d1', tertiaryKV: 13.8, src: 'estimate' as SourceId };
export const TRANSFORMERS: TransformerRecord[] = [
  { site: 'ROUND_MTN', hvKV: 500, lvKV: 230, banks: 1, mva: 1120, ...AUTO },
  { site: 'TABLE_MTN', hvKV: 500, lvKV: 230, banks: 2, mva: 1120, ...AUTO },
  { site: 'VACA_DIXON', hvKV: 500, lvKV: 230, banks: 2, mva: 1120, ...AUTO },
  { site: 'TESLA', hvKV: 500, lvKV: 230, banks: 3, mva: 1120, ...AUTO },
  { site: 'METCALF', hvKV: 500, lvKV: 230, banks: 2, mva: 1120, ...AUTO },
  { site: 'MOSS_LANDING', hvKV: 500, lvKV: 230, banks: 2, mva: 1120, ...AUTO },
  { site: 'GATES', hvKV: 500, lvKV: 230, banks: 2, mva: 1120, ...AUTO },
  { site: 'WESTLANDS', hvKV: 500, lvKV: 230, banks: 3, mva: 1120, ...AUTO },
  { site: 'ANTELOPE', hvKV: 500, lvKV: 230, banks: 3, mva: 1120, ...AUTO },
  { site: 'MIDWAY', hvKV: 500, lvKV: 230, banks: 3, mva: 1120, ...AUTO },
  { site: 'VINCENT', hvKV: 500, lvKV: 230, banks: 3, mva: 1120, ...AUTO },
  { site: 'MIRA_LOMA', hvKV: 500, lvKV: 230, banks: 3, mva: 1120, ...AUTO },
  { site: 'SERRANO', hvKV: 500, lvKV: 230, banks: 4, mva: 1120, ...AUTO },
  { site: 'DEVERS', hvKV: 500, lvKV: 230, banks: 2, mva: 1120, ...AUTO },
  { site: 'MIGUEL', hvKV: 500, lvKV: 230, banks: 3, mva: 1120, ...AUTO },
  { site: 'IMPERIAL_VALLEY', hvKV: 500, lvKV: 230, banks: 2, mva: 1120, ...AUTO },
  { site: 'COTTONWOOD', hvKV: 230, lvKV: 115, banks: 1, mva: 200, xPct: 10, xr: 35, vectorGroup: 'YNyn0d1', tertiaryKV: 13.8, src: 'estimate' },
  {
    site: 'METCALF',
    hvKV: 230,
    lvKV: 60,
    banks: 2,
    mva: 200,
    xPct: 11,
    xr: 35,
    vectorGroup: 'YNyn0d1',
    tertiaryKV: 13.8,
    plain: 'Steps bulk transmission down to the 60 kV subtransmission network that feeds San José’s neighbourhood substations.',
    src: 'estimate',
  },
];

export interface LoadRecord {
  bus: string; // SITE-kV
  /** Demand at the reference peak, MW (3φ). */
  peakMW: number;
  /** Power factor of the demand (lagging). */
  pf: number;
  /** Behind-the-meter (rooftop) solar capacity, MW AC, netted from this load. */
  btmMW: number;
}

const L = (bus: string, peakMW: number, btmMW: number, pf = 0.97): LoadRecord => ({ bus, peakMW, pf, btmMW });

export const LOADS: LoadRecord[] = [
  // north & bay (PG&E, SMUD and neighbours)
  L('ROUND_MTN-230', 250, 90),
  L('COTTONWOOD-230', 350, 130),
  L('HUMBOLDT-115', 140, 30),
  L('TABLE_MTN-230', 700, 280),
  L('ELVERTA-230', 2900, 1000),
  L('RANCHO_SECO-230', 250, 90),
  L('VACA_DIXON-230', 800, 330),
  L('LAKEVILLE-230', 1100, 380),
  L('GEYSERS-230', 40, 0),
  L('CONTRA_COSTA-230', 1100, 380),
  L('MORAGA-230', 1700, 500),
  L('MARTIN-230', 900, 150, 0.96),
  L('RAVENSWOOD-230', 1200, 330),
  L('NEWARK-230', 1300, 420),
  L('TESLA-230', 500, 200),
  L('METCALF-230', 1500, 450),
  L('EVERGREEN-60', 70, 25),
  L('MOSS_LANDING-230', 750, 220),
  L('BELLOTA-230', 1600, 650),
  L('HERNDON-230', 1600, 700),
  L('WESTLANDS-230', 500, 200, 0.92),
  L('GATES-230', 1000, 420, 0.93),
  L('CARRIZO-230', 300, 120),
  L('MIDWAY-230', 450, 60, 0.9),
  L('MAGUNDEN-230', 1200, 480),
  L('BIG_CREEK-230', 40, 0),
  // south (SCE, LADWP, SDG&E, IID)
  L('ANTELOPE-230', 800, 380),
  L('VINCENT-230', 600, 260),
  L('SYLMAR-230', 2200, 700),
  L('MOORPARK-230', 1300, 480),
  L('GOLETA-230', 330, 110),
  L('SCATTERGOOD-230', 2400, 600),
  L('LAGUNA_BELL-230', 3200, 800),
  L('HAYNES-230', 1800, 450),
  L('MIRA_LOMA-230', 2400, 900),
  L('VISTA-230', 1500, 600),
  L('SERRANO-230', 1800, 600),
  L('BARRE-230', 1600, 500),
  L('SANTIAGO-230', 1400, 480),
  L('DEVERS-230', 1300, 520, 0.95),
  L('SAN_ONOFRE-230', 200, 70),
  L('ENCINA-230', 1100, 420),
  L('SYCAMORE-230', 1000, 420),
  L('MISSION-230', 1700, 520),
  L('OTAY_MESA-230', 500, 170),
  L('MIGUEL-230', 400, 160),
  L('IMPERIAL_VALLEY-230', 900, 250, 0.93),
];

export interface HvdcRecord {
  id: string;
  name: string;
  from: string; // bus
  to: string; // bus
  /** Scheduled transfer at the sending end, MW, and converter losses (both ends) as a fraction. */
  scheduleMW: number;
  lossFrac: number;
  kvDC: number;
  plain: string;
  src: SourceId;
}

export const HVDC: HvdcRecord[] = [
  {
    id: 'TBC',
    name: 'Trans Bay Cable',
    from: 'CONTRA_COSTA-230',
    to: 'MARTIN-230',
    scheduleMW: 330,
    lossFrac: 0.03,
    kvDC: 200,
    plain: 'A direct-current cable under the Bay from Pittsburg to San Francisco. Converters set its flow; the AC network does not.',
    src: 'estimate',
  },
];
