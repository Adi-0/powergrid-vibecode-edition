# Model tables (generated)

Generated from `src/data/` by `tools/dev/gen-model-doc.test.ts`. Do not edit by hand.

## Conductors

| Conductor | Size | R (Ω/mi, 50 °C) | GMR (ft) | Diameter (in) | Ampacity (A) | Source |
|---|---|---|---|---|---|---|
| Dove (ACSR) | 556,500 cmil 26/7 | 0.1859 | 0.0313 | 0.927 | 730 | Kersting — Distribution System Modeling and Analysis |
| Linnet (ACSR) | 336,400 cmil 26/7 | 0.306 | 0.0244 | 0.721 | 530 | Kersting — Distribution System Modeling and Analysis |
| Penguin (ACSR) | 4/0 6/1 | 0.592 | 0.00814 | 0.563 | 340 | Kersting — Distribution System Modeling and Analysis |
| Raven (ACSR) | 1/0 6/1 | 1.12 | 0.00446 | 0.398 | 230 | Kersting — Distribution System Modeling and Analysis |
| 250 kcmil AA (AA) | 250,000 cmil | 0.41 | 0.0171 | 0.567 | 329 | Kersting — Distribution System Modeling and Analysis |
| 1/0 AA (AA) | 1/0 | 0.97 | 0.0111 | 0.368 | 202 | Kersting — Distribution System Modeling and Analysis |
| 1/0 copper (Cu) | 1/0 | 0.607 | 0.01113 | 0.368 | 310 | Kersting — Distribution System Modeling and Analysis |
| #14 copper strand (Cu) | #14 | 14.8722 | 0.00208 | 0.0641 | 20 | Kersting — Distribution System Modeling and Analysis |
| Bittern (ACSR) | 1,272,000 cmil 45/7 | 0.0823 | 0.0445 | 1.345 | 1200 | Glover, Overbye & Sarma — Power System Analysis and Design (estimate) |
| Drake (ACSR) | 795,000 cmil 26/7 | 0.1284 | 0.0375 | 1.108 | 907 | Glover, Overbye & Sarma — Power System Analysis and Design (estimate) |
| Hawk (ACSR) | 477,000 cmil 26/7 | 0.212 | 0.029 | 0.858 | 659 | Glover, Overbye & Sarma — Power System Analysis and Design (estimate) |
| 7 #8 Alumoweld (shield wire) (Alumoweld) | 7 #8 | 1.2 | 0.0052 | 0.385 | 0 | Estimate — typical of class (estimate) |

## Line constructions and computed constants

Positive- and zero-sequence per-km values computed by modified Carson + Kron reduction (ρ = 100 Ω·m, 60 Hz).

| Construction | z₁ (Ω/km) | z₀ (Ω/km) | b₁ (µS/km) | Z_c (Ω) | SIL (MW) | Thermal (MVA) |
|---|---|---|---|---|---|---|
| 500 kV lattice, horizontal, 3 × 1272 kcmil ACSR "Bittern" per phase, two shield wires | 0.0178 + j0.3428 | 0.2700 + j0.9162 | 4.806 | 267.3 | 935 | 3118 |
| 230 kV steel, horizontal, 2 × 795 kcmil ACSR "Drake" per phase, one shield wire | 0.0400 + j0.3621 | 0.3075 + j1.1355 | 4.542 | 283.2 | 187 | 723 |
| 115 kV wood H-frame, 477 kcmil ACSR "Hawk", one shield wire | 0.1318 + j0.4784 | 0.4305 + j1.3234 | 3.449 | 379.3 | 35 | 131 |
| 230 kV steel, horizontal, 1 × 795 kcmil ACSR "Drake" per phase, one shield wire | 0.0799 + j0.5012 | 0.3474 + j1.2745 | 3.292 | 392.6 | 135 | 250 |
| 60 kV wood pole crossarm, 556.5 kcmil ACSR "Dove", three-wire | 0.1155 + j0.4193 | 0.2932 + j1.7397 | 3.943 | 332.1 | 11 | 76 |

## Technologies

Fuel prices (estimate): gas $4.5/MMBtu, uranium $0.7/MMBtu, CO₂ $30/t at 0.0531 t/MMBtu.

| Technology | Synchronous | H (s) | Droop | Heat rate (Btu/kWh) | Pmin | Ramp (/min) | Min up (h) | Source |
|---|---|---|---|---|---|---|---|---|
| Nuclear (PWR) | yes | 4 | — | 10450 | 100 % | 0 % | 24 | Kundur — Power System Stability and Control (estimate) |
| Gas combined cycle | yes | 5.5 | 5 % | 7000 | 40 % | 5 % | 4 | US EIA — generator heat rates and capacity by technology (estimate) |
| Gas combustion turbine (peaker) | yes | 4 | 5 % | 10000 | 30 % | 20 % | 1 | US EIA — generator heat rates and capacity by technology (estimate) |
| Gas cogeneration | yes | 4 | 5 % | 8500 | 60 % | 3 % | 24 | US EIA — generator heat rates and capacity by technology (estimate) |
| Gas reciprocating engines | yes | 1.5 | 5 % | 8300 | 20 % | 100 % | 1 | Estimate — typical of class (estimate) |
| Hydroelectric | yes | 3 | 5 % | — | 20 % | 50 % | 0 | Kundur — Power System Stability and Control (estimate) |
| Pumped-storage hydro | yes | 3.5 | 5 % | — | 0 % | 50 % | 0 | Kundur — Power System Stability and Control (estimate) |
| Geothermal | yes | 3 | — | — | 90 % | 1 % | 24 | Estimate — typical of class (estimate) |
| Wind | no | 0 | — | — | 0 % | 100 % | 0 | Estimate — typical of class (estimate) |
| Solar photovoltaic | no | 0 | — | — | 0 % | 100 % | 0 | Estimate — typical of class (estimate) |
| Battery storage (4 h) | no | 0 | 5 % | — | -100 % | 100 % | 0 | Estimate — typical of class (estimate) |
| Import over AC ties | yes | 4 | 5 % | — | 0 % | 2 % | 0 | WECC path ratings and frequency-response practice (estimate) |
| Import over a DC link | no | 0 | — | — | 0 % | 5 % | 0 | WECC path ratings and frequency-response practice (estimate) |
| Synchronous condenser | yes | 1.5 | — | — | 0 % | 0 % | 0 | Kundur — Power System Stability and Control (estimate) |

## Sites

57 sites, 78 buses, 217 branches (171 line circuits, 46 transformer banks).

| Site | Region | Lat | Lon | kV |
|---|---|---|---|---|
| Malin (Oregon) | Interties | 42.013 | -121.408 | 500 |
| Round Mountain | North State & Sacramento | 40.793 | -121.932 | 500, 230 |
| Pit River | North State & Sacramento | 40.99 | -121.96 | 230 |
| Cottonwood | North State & Sacramento | 40.388 | -122.283 | 230, 115 |
| Humboldt | North State & Sacramento | 40.742 | -124.21 | 115 |
| Table Mountain | North State & Sacramento | 39.636 | -121.557 | 500, 230 |
| Elverta (Sacramento) | North State & Sacramento | 38.717 | -121.462 | 230 |
| Rancho Seco | North State & Sacramento | 38.34 | -121.12 | 230 |
| Vaca-Dixon | San Francisco Bay Area | 38.405 | -121.915 | 500, 230 |
| The Geysers | San Francisco Bay Area | 38.79 | -122.76 | 230 |
| Lakeville (Petaluma) | San Francisco Bay Area | 38.2 | -122.57 | 230 |
| Contra Costa | San Francisco Bay Area | 38.017 | -121.838 | 230 |
| Tesla | San Francisco Bay Area | 37.703 | -121.558 | 500, 230 |
| Moraga (East Bay) | San Francisco Bay Area | 37.838 | -122.128 | 230 |
| Martin (San Francisco) | San Francisco Bay Area | 37.712 | -122.418 | 230 |
| Ravenswood (Peninsula) | San Francisco Bay Area | 37.478 | -122.138 | 230 |
| Newark | San Francisco Bay Area | 37.525 | -122.025 | 230 |
| Metcalf (San José) | San Francisco Bay Area | 37.228 | -121.748 | 500, 230, 60 |
| Evergreen | San Francisco Bay Area | 37.31 | -121.79 | 60 |
| Moss Landing | Central Coast | 36.805 | -121.782 | 500, 230 |
| Bellota (Stockton) | Central Valley & Sierra | 38.045 | -121.055 | 230 |
| Los Banos | Central Valley & Sierra | 37.03 | -120.867 | 500 |
| Herndon (Fresno) | Central Valley & Sierra | 36.838 | -119.827 | 230 |
| Helms | Central Valley & Sierra | 37.04 | -118.965 | 230 |
| Westlands | Central Valley & Sierra | 36.45 | -120.25 | 500, 230 |
| Gates | Central Valley & Sierra | 36.135 | -120.115 | 500, 230 |
| Diablo Canyon | Central Coast | 35.212 | -120.855 | 500 |
| Carrizo Plain | Central Coast | 35.38 | -120.07 | 230 |
| Midway | Central Valley & Sierra | 35.335 | -119.475 | 500, 230 |
| Magunden (Bakersfield) | Central Valley & Sierra | 35.37 | -118.95 | 230 |
| Big Creek | Central Valley & Sierra | 37.205 | -119.245 | 230 |
| Windhub (Tehachapi) | Inland Empire & Deserts | 35.06 | -118.3 | 500 |
| Antelope (Lancaster) | Inland Empire & Deserts | 34.69 | -118.27 | 500, 230 |
| Vincent | Los Angeles Basin | 34.485 | -118.115 | 500, 230 |
| Sylmar | Los Angeles Basin | 34.311 | -118.487 | 230 |
| Moorpark (Ventura) | Los Angeles Basin | 34.285 | -118.905 | 230 |
| Goleta (Santa Barbara) | Los Angeles Basin | 34.435 | -119.828 | 230 |
| Scattergood (El Segundo) | Los Angeles Basin | 33.918 | -118.428 | 230 |
| Laguna Bell (Los Angeles) | Los Angeles Basin | 33.978 | -118.16 | 230 |
| Haynes (Long Beach) | Los Angeles Basin | 33.762 | -118.1 | 230 |
| Lugo | Inland Empire & Deserts | 34.368 | -117.366 | 500 |
| Mira Loma | Inland Empire & Deserts | 33.988 | -117.552 | 500, 230 |
| Vista (San Bernardino) | Inland Empire & Deserts | 34.065 | -117.3 | 230 |
| Serrano | Los Angeles Basin | 33.83 | -117.7 | 500, 230 |
| Barre (Orange County) | Los Angeles Basin | 33.81 | -117.985 | 230 |
| Santiago (Irvine) | Los Angeles Basin | 33.713 | -117.747 | 230 |
| Devers (Palm Springs) | Inland Empire & Deserts | 33.935 | -116.58 | 500, 230 |
| Colorado River (Blythe) | Inland Empire & Deserts | 33.63 | -114.68 | 500 |
| Palo Verde (Arizona) | Interties | 33.39 | -112.86 | 500 |
| Eldorado (Nevada) | Interties | 35.795 | -114.98 | 500 |
| San Onofre | San Diego & Imperial | 33.37 | -117.555 | 230 |
| Encina (Carlsbad) | San Diego & Imperial | 33.14 | -117.335 | 230 |
| Sycamore Canyon | San Diego & Imperial | 32.935 | -117.02 | 230 |
| Mission (San Diego) | San Diego & Imperial | 32.78 | -117.14 | 230 |
| Otay Mesa | San Diego & Imperial | 32.573 | -116.93 | 230 |
| Miguel | San Diego & Imperial | 32.692 | -116.868 | 500, 230 |
| Imperial Valley | San Diego & Imperial | 32.72 | -115.88 | 500, 230 |

## Lines

| Circuit | kV | Length (km) | Construction | R (pu) | X (pu) | B (pu) | Rating (MVA) | Emergency (MVA) | St. Clair (MW) |
|---|---|---|---|---|---|---|---|---|---|
| Malin – Round Mountain 500 kV #1 | 500 | 163.9 | EHV500 | 0.00115 | 0.02231 | 1.9765 | 3118 | 3741 | 1853 |
| Malin – Round Mountain 500 kV #2 | 500 | 163.9 | EHV500 | 0.00115 | 0.02231 | 1.9765 | 3118 | 3741 | 1853 |
| Malin – Table Mountain 500 kV | 500 | 317.5 | EHV500 | 0.00214 | 0.04235 | 3.8687 | 3118 | 3741 | 1225 |
| Round Mountain – Table Mountain 500 kV #1 | 500 | 152.4 | EHV500 | 0.00107 | 0.02077 | 1.8371 | 3118 | 3741 | 1959 |
| Round Mountain – Table Mountain 500 kV #2 | 500 | 152.4 | EHV500 | 0.00107 | 0.02077 | 1.8371 | 3118 | 3741 | 1959 |
| Table Mountain – Vaca-Dixon 500 kV | 500 | 161.4 | EHV500 | 0.00114 | 0.02197 | 1.9459 | 3118 | 3741 | 1864 |
| Table Mountain – Tesla 500 kV | 500 | 247.2 | EHV500 | 0.00170 | 0.03333 | 2.9950 | 3118 | 3741 | 1471 |
| Vaca-Dixon – Tesla 500 kV | 500 | 96.7 | EHV500 | 0.00069 | 0.01323 | 1.1633 | 3118 | 3741 | 2611 |
| Tesla – Metcalf (San José) 500 kV | 500 | 63.7 | EHV500 | 0.00045 | 0.00873 | 0.7661 | 3118 | 3741 | 2806 |
| Tesla – Los Banos 500 kV #1 | 500 | 111.1 | EHV500 | 0.00079 | 0.01518 | 1.3368 | 3118 | 3741 | 2443 |
| Tesla – Los Banos 500 kV #2 | 500 | 111.1 | EHV500 | 0.00079 | 0.01518 | 1.3368 | 3118 | 3741 | 2443 |
| Metcalf (San José) – Moss Landing 500 kV | 500 | 54.2 | EHV500 | 0.00039 | 0.00743 | 0.6515 | 3118 | 3741 | 2806 |
| Moss Landing – Los Banos 500 kV #1 | 500 | 106.4 | EHV500 | 0.00075 | 0.01454 | 1.2801 | 3118 | 3741 | 2498 |
| Moss Landing – Los Banos 500 kV #2 | 500 | 106.4 | EHV500 | 0.00075 | 0.01454 | 1.2801 | 3118 | 3741 | 2498 |
| Los Banos – Gates 500 kV | 500 | 138.1 | EHV500 | 0.00097 | 0.01883 | 1.6631 | 3118 | 3741 | 2127 |
| Los Banos – Westlands 500 kV | 500 | 97.5 | EHV500 | 0.00069 | 0.01333 | 1.1725 | 3118 | 3741 | 2602 |
| Westlands – Gates 500 kV | 500 | 42.6 | EHV500 | 0.00030 | 0.00584 | 0.5121 | 3118 | 3741 | 2806 |
| Los Banos – Midway 500 kV | 500 | 260.0 | EHV500 | 0.00179 | 0.03500 | 3.1535 | 3118 | 3741 | 1426 |
| Gates – Midway 500 kV #1 | 500 | 122.0 | EHV500 | 0.00086 | 0.01666 | 1.4685 | 3118 | 3741 | 2315 |
| Gates – Midway 500 kV #2 | 500 | 122.0 | EHV500 | 0.00086 | 0.01666 | 1.4685 | 3118 | 3741 | 2315 |
| Gates – Diablo Canyon 500 kV | 500 | 153.1 | EHV500 | 0.00108 | 0.02086 | 1.8454 | 3118 | 3741 | 1951 |
| Diablo Canyon – Midway 500 kV #1 | 500 | 157.5 | EHV500 | 0.00111 | 0.02145 | 1.8991 | 3118 | 3741 | 1900 |
| Diablo Canyon – Midway 500 kV #2 | 500 | 157.5 | EHV500 | 0.00111 | 0.02145 | 1.8991 | 3118 | 3741 | 1900 |
| Midway – Vincent 500 kV #1 | 500 | 202.7 | EHV500 | 0.00141 | 0.02748 | 2.4492 | 3118 | 3741 | 1671 |
| Midway – Vincent 500 kV #2 | 500 | 202.7 | EHV500 | 0.00141 | 0.02748 | 2.4492 | 3118 | 3741 | 1671 |
| Midway – Windhub (Tehachapi) 500 kV | 500 | 144.4 | EHV500 | 0.00102 | 0.01969 | 1.7396 | 3118 | 3741 | 2053 |
| Windhub (Tehachapi) – Vincent 500 kV #1 | 500 | 76.1 | EHV500 | 0.00054 | 0.01041 | 0.9145 | 3118 | 3741 | 2806 |
| Windhub (Tehachapi) – Vincent 500 kV #2 | 500 | 76.1 | EHV500 | 0.00054 | 0.01041 | 0.9145 | 3118 | 3741 | 2806 |
| Windhub (Tehachapi) – Antelope (Lancaster) 500 kV | 500 | 47.4 | EHV500 | 0.00034 | 0.00650 | 0.5699 | 3118 | 3741 | 2806 |
| Antelope (Lancaster) – Vincent 500 kV | 500 | 30.9 | EHV500 | 0.00022 | 0.00423 | 0.3710 | 3118 | 3741 | 2806 |
| Vincent – Lugo 500 kV | 500 | 80.4 | EHV500 | 0.00057 | 0.01101 | 0.9669 | 3118 | 3741 | 2801 |
| Vincent – Mira Loma 500 kV | 500 | 94.6 | EHV500 | 0.00067 | 0.01295 | 1.1385 | 3118 | 3741 | 2635 |
| Lugo – Mira Loma 500 kV #1 | 500 | 54.7 | EHV500 | 0.00039 | 0.00750 | 0.6575 | 3118 | 3741 | 2806 |
| Lugo – Mira Loma 500 kV #2 | 500 | 54.7 | EHV500 | 0.00039 | 0.00750 | 0.6575 | 3118 | 3741 | 2806 |
| Lugo – Eldorado 500 kV #1 | 500 | 309.2 | EHV500 | 0.00209 | 0.04130 | 3.7649 | 3118 | 3741 | 1254 |
| Lugo – Eldorado 500 kV #2 | 500 | 309.2 | EHV500 | 0.00209 | 0.04130 | 3.7649 | 3118 | 3741 | 1254 |
| Mira Loma – Serrano 500 kV #1 | 500 | 25.6 | EHV500 | 0.00018 | 0.00351 | 0.3075 | 3118 | 3741 | 2806 |
| Mira Loma – Serrano 500 kV #2 | 500 | 25.6 | EHV500 | 0.00018 | 0.00351 | 0.3075 | 3118 | 3741 | 2806 |
| Serrano – Devers (Palm Springs) 500 kV | 500 | 124.9 | EHV500 | 0.00088 | 0.01705 | 1.5033 | 3118 | 3741 | 2282 |
| Mira Loma – Devers (Palm Springs) 500 kV #1 | 500 | 107.8 | EHV500 | 0.00076 | 0.01474 | 1.2973 | 3118 | 3741 | 2481 |
| Mira Loma – Devers (Palm Springs) 500 kV #2 | 500 | 107.8 | EHV500 | 0.00076 | 0.01474 | 1.2973 | 3118 | 3741 | 2481 |
| Devers (Palm Springs) – Colorado River (Blythe) 500 kV #1 | 500 | 205.7 | EHV500 | 0.00143 | 0.02788 | 2.4855 | 3118 | 3741 | 1657 |
| Devers (Palm Springs) – Colorado River (Blythe) 500 kV #2 | 500 | 205.7 | EHV500 | 0.00143 | 0.02788 | 2.4855 | 3118 | 3741 | 1657 |
| Devers (Palm Springs) – Colorado River (Blythe) 500 kV #3 | 500 | 205.7 | EHV500 | 0.00143 | 0.02788 | 2.4855 | 3118 | 3741 | 1657 |
| Colorado River (Blythe) – Palo Verde 500 kV #1 | 500 | 196.5 | EHV500 | 0.00137 | 0.02666 | 2.3730 | 3118 | 3741 | 1700 |
| Colorado River (Blythe) – Palo Verde 500 kV #2 | 500 | 196.5 | EHV500 | 0.00137 | 0.02666 | 2.3730 | 3118 | 3741 | 1700 |
| Palo Verde – Imperial Valley 500 kV | 500 | 280.0 | EHV500 | 0.00191 | 0.03758 | 3.4008 | 3118 | 3741 | 1356 |
| Imperial Valley – Miguel 500 kV #1 | 500 | 111.0 | EHV500 | 0.00079 | 0.01517 | 1.3358 | 3118 | 3741 | 2444 |
| Imperial Valley – Miguel 500 kV #2 | 500 | 111.0 | EHV500 | 0.00079 | 0.01517 | 1.3358 | 3118 | 3741 | 2444 |
| Round Mountain – Pit River 230 kV #1 | 230 | 25.3 | HV230_2B | 0.00191 | 0.01734 | 0.0609 | 723 | 867 | 560 |
| Round Mountain – Pit River 230 kV #2 | 230 | 25.3 | HV230_2B | 0.00191 | 0.01734 | 0.0609 | 723 | 867 | 560 |
| Round Mountain – Cottonwood 230 kV #1 | 230 | 62.0 | HV230_2B | 0.00467 | 0.04240 | 0.1490 | 723 | 867 | 560 |
| Round Mountain – Cottonwood 230 kV #2 | 230 | 62.0 | HV230_2B | 0.00467 | 0.04240 | 0.1490 | 723 | 867 | 560 |
| Cottonwood – Table Mountain 230 kV | 230 | 119.6 | HV230_2B | 0.00896 | 0.08155 | 0.2879 | 723 | 867 | 468 |
| Cottonwood – Vaca-Dixon 230 kV | 230 | 256.2 | HV230_2B | 0.01866 | 0.17227 | 0.6211 | 723 | 867 | 288 |
| Table Mountain – Elverta (Sacramento) 230 kV #1 | 230 | 117.9 | HV230_2B | 0.00884 | 0.08040 | 0.2838 | 723 | 867 | 472 |
| Table Mountain – Elverta (Sacramento) 230 kV #2 | 230 | 117.9 | HV230_2B | 0.00884 | 0.08040 | 0.2838 | 723 | 867 | 472 |
| Table Mountain – Elverta (Sacramento) 230 kV #3 | 230 | 117.9 | HV230_2B | 0.00884 | 0.08040 | 0.2838 | 723 | 867 | 472 |
| Elverta (Sacramento) – Rancho Seco 230 kV #1 | 230 | 59.1 | HV230_2B | 0.00446 | 0.04043 | 0.1421 | 723 | 867 | 560 |
| Elverta (Sacramento) – Rancho Seco 230 kV #2 | 230 | 59.1 | HV230_2B | 0.00446 | 0.04043 | 0.1421 | 723 | 867 | 560 |
| Elverta (Sacramento) – Vaca-Dixon 230 kV #1 | 230 | 60.4 | HV230_2B | 0.00455 | 0.04128 | 0.1451 | 723 | 867 | 560 |
| Elverta (Sacramento) – Vaca-Dixon 230 kV #2 | 230 | 60.4 | HV230_2B | 0.00455 | 0.04128 | 0.1451 | 723 | 867 | 560 |
| Elverta (Sacramento) – Vaca-Dixon 230 kV #3 | 230 | 60.4 | HV230_2B | 0.00455 | 0.04128 | 0.1451 | 723 | 867 | 560 |
| Rancho Seco – Bellota (Stockton) 230 kV | 230 | 38.3 | HV230_2B | 0.00289 | 0.02620 | 0.0920 | 723 | 867 | 560 |
| Vaca-Dixon – Lakeville (Petaluma) 230 kV #1 | 230 | 70.8 | HV230_2B | 0.00533 | 0.04838 | 0.1701 | 723 | 867 | 560 |
| Vaca-Dixon – Lakeville (Petaluma) 230 kV #2 | 230 | 70.8 | HV230_2B | 0.00533 | 0.04838 | 0.1701 | 723 | 867 | 560 |
| Lakeville (Petaluma) – The Geysers 230 kV #1 | 230 | 88.0 | HV230_2B | 0.00662 | 0.06008 | 0.2115 | 723 | 867 | 542 |
| Lakeville (Petaluma) – The Geysers 230 kV #2 | 230 | 88.0 | HV230_2B | 0.00662 | 0.06008 | 0.2115 | 723 | 867 | 542 |
| The Geysers – Vaca-Dixon 230 kV | 230 | 110.5 | HV230_2B | 0.00829 | 0.07540 | 0.2659 | 723 | 867 | 489 |
| Vaca-Dixon – Contra Costa 230 kV #1 | 230 | 50.2 | HV230_2B | 0.00379 | 0.03435 | 0.1207 | 723 | 867 | 560 |
| Vaca-Dixon – Contra Costa 230 kV #2 | 230 | 50.2 | HV230_2B | 0.00379 | 0.03435 | 0.1207 | 723 | 867 | 560 |
| Lakeville (Petaluma) – Moraga (East Bay) 230 kV | 230 | 64.2 | HV230_2B | 0.00484 | 0.04392 | 0.1544 | 723 | 867 | 560 |
| Contra Costa – Moraga (East Bay) 230 kV #1 | 230 | 37.1 | HV230_2B | 0.00280 | 0.02542 | 0.0893 | 723 | 867 | 560 |
| Contra Costa – Moraga (East Bay) 230 kV #2 | 230 | 37.1 | HV230_2B | 0.00280 | 0.02542 | 0.0893 | 723 | 867 | 560 |
| Contra Costa – Moraga (East Bay) 230 kV #3 | 230 | 37.1 | HV230_2B | 0.00280 | 0.02542 | 0.0893 | 723 | 867 | 560 |
| Contra Costa – Tesla 230 kV | 230 | 49.1 | HV230_2B | 0.00371 | 0.03359 | 0.1180 | 723 | 867 | 560 |
| Moraga (East Bay) – Newark 230 kV | 230 | 41.4 | HV230_2B | 0.00312 | 0.02830 | 0.0994 | 723 | 867 | 560 |
| Tesla – Newark 230 kV #1 | 230 | 52.5 | HV230_2B | 0.00396 | 0.03591 | 0.1262 | 723 | 867 | 560 |
| Tesla – Newark 230 kV #2 | 230 | 52.5 | HV230_2B | 0.00396 | 0.03591 | 0.1262 | 723 | 867 | 560 |
| Tesla – Newark 230 kV #3 | 230 | 52.5 | HV230_2B | 0.00396 | 0.03591 | 0.1262 | 723 | 867 | 560 |
| Newark – Ravenswood (Peninsula) 230 kV #1 | 230 | 12.9 | HV230_2B | 0.00098 | 0.00886 | 0.0311 | 723 | 867 | 560 |
| Newark – Ravenswood (Peninsula) 230 kV #2 | 230 | 12.9 | HV230_2B | 0.00098 | 0.00886 | 0.0311 | 723 | 867 | 560 |
| Newark – Ravenswood (Peninsula) 230 kV #3 | 230 | 12.9 | HV230_2B | 0.00098 | 0.00886 | 0.0311 | 723 | 867 | 560 |
| Ravenswood (Peninsula) – Martin (San Francisco) 230 kV #1 | 230 | 41.2 | HV230_2B | 0.00311 | 0.02821 | 0.0991 | 723 | 867 | 560 |
| Ravenswood (Peninsula) – Martin (San Francisco) 230 kV #2 | 230 | 41.2 | HV230_2B | 0.00311 | 0.02821 | 0.0991 | 723 | 867 | 560 |
| Newark – Metcalf (San José) 230 kV #1 | 230 | 47.3 | HV230_2B | 0.00357 | 0.03234 | 0.1136 | 723 | 867 | 560 |
| Newark – Metcalf (San José) 230 kV #2 | 230 | 47.3 | HV230_2B | 0.00357 | 0.03234 | 0.1136 | 723 | 867 | 560 |
| Ravenswood (Peninsula) – Metcalf (San José) 230 kV #1 | 230 | 50.9 | HV230_2B | 0.00384 | 0.03484 | 0.1224 | 723 | 867 | 560 |
| Ravenswood (Peninsula) – Metcalf (San José) 230 kV #2 | 230 | 50.9 | HV230_2B | 0.00384 | 0.03484 | 0.1224 | 723 | 867 | 560 |
| Metcalf (San José) – Moss Landing 230 kV #1 | 230 | 54.2 | HV230_2B | 0.00409 | 0.03708 | 0.1303 | 723 | 867 | 560 |
| Metcalf (San José) – Moss Landing 230 kV #2 | 230 | 54.2 | HV230_2B | 0.00409 | 0.03708 | 0.1303 | 723 | 867 | 560 |
| Metcalf (San José) – Moss Landing 230 kV #3 | 230 | 54.2 | HV230_2B | 0.00409 | 0.03708 | 0.1303 | 723 | 867 | 560 |
| Tesla – Bellota (Stockton) 230 kV | 230 | 67.0 | HV230_2B | 0.00505 | 0.04582 | 0.1611 | 723 | 867 | 560 |
| Bellota (Stockton) – Herndon (Fresno) 230 kV #1 | 230 | 198.4 | HV230_2B | 0.01467 | 0.13438 | 0.4793 | 723 | 867 | 338 |
| Bellota (Stockton) – Herndon (Fresno) 230 kV #2 | 230 | 198.4 | HV230_2B | 0.01467 | 0.13438 | 0.4793 | 723 | 867 | 338 |
| Herndon (Fresno) – Helms 230 kV #1 | 230 | 107.8 | HV230_2B | 0.00809 | 0.07355 | 0.2594 | 723 | 867 | 495 |
| Herndon (Fresno) – Helms 230 kV #2 | 230 | 107.8 | HV230_2B | 0.00809 | 0.07355 | 0.2594 | 723 | 867 | 495 |
| Herndon (Fresno) – Helms 230 kV #3 | 230 | 107.8 | HV230_2B | 0.00809 | 0.07355 | 0.2594 | 723 | 867 | 495 |
| Herndon (Fresno) – Gates 230 kV #1 | 230 | 94.6 | HV230_2B | 0.00712 | 0.06464 | 0.2277 | 723 | 867 | 526 |
| Herndon (Fresno) – Gates 230 kV #2 | 230 | 94.6 | HV230_2B | 0.00712 | 0.06464 | 0.2277 | 723 | 867 | 526 |
| Westlands – Gates 230 kV #1 | 230 | 42.6 | HV230_2B | 0.00322 | 0.02916 | 0.1024 | 723 | 867 | 560 |
| Westlands – Gates 230 kV #2 | 230 | 42.6 | HV230_2B | 0.00322 | 0.02916 | 0.1024 | 723 | 867 | 560 |
| Westlands – Herndon (Fresno) 230 kV #1 | 230 | 65.9 | HV230_2B | 0.00497 | 0.04507 | 0.1585 | 723 | 867 | 560 |
| Westlands – Herndon (Fresno) 230 kV #2 | 230 | 65.9 | HV230_2B | 0.00497 | 0.04507 | 0.1585 | 723 | 867 | 560 |
| Gates – Midway 230 kV | 230 | 122.0 | HV230_2B | 0.00914 | 0.08317 | 0.2937 | 723 | 867 | 462 |
| Carrizo Plain – Midway 230 kV #1 | 230 | 62.3 | HV230_2B | 0.00470 | 0.04262 | 0.1498 | 723 | 867 | 560 |
| Carrizo Plain – Midway 230 kV #2 | 230 | 62.3 | HV230_2B | 0.00470 | 0.04262 | 0.1498 | 723 | 867 | 560 |
| Midway – Magunden (Bakersfield) 230 kV #1 | 230 | 54.9 | HV230_2B | 0.00414 | 0.03758 | 0.1321 | 723 | 867 | 560 |
| Midway – Magunden (Bakersfield) 230 kV #2 | 230 | 54.9 | HV230_2B | 0.00414 | 0.03758 | 0.1321 | 723 | 867 | 560 |
| Magunden (Bakersfield) – Big Creek 230 kV #1 | 230 | 257.2 | HV230_2B | 0.01873 | 0.17293 | 0.6236 | 723 | 867 | 287 |
| Magunden (Bakersfield) – Big Creek 230 kV #2 | 230 | 257.2 | HV230_2B | 0.01873 | 0.17293 | 0.6236 | 723 | 867 | 287 |
| Big Creek – Herndon (Fresno) 230 kV #1 | 230 | 85.6 | HV230_2B | 0.00644 | 0.05848 | 0.2059 | 723 | 867 | 547 |
| Big Creek – Herndon (Fresno) 230 kV #2 | 230 | 85.6 | HV230_2B | 0.00644 | 0.05848 | 0.2059 | 723 | 867 | 547 |
| Magunden (Bakersfield) – Vincent 230 kV | 230 | 161.7 | HV230_2B | 0.01204 | 0.10994 | 0.3900 | 723 | 867 | 372 |
| Cottonwood – Humboldt 115 kV #1 | 115 | 226.1 | HV115 | 0.21899 | 0.80722 | 0.1039 | 131 | 158 | 58 |
| Cottonwood – Humboldt 115 kV #2 | 115 | 226.1 | HV115 | 0.21899 | 0.80722 | 0.1039 | 131 | 158 | 58 |
| Antelope (Lancaster) – Vincent 230 kV #1 | 230 | 30.9 | HV230_2B | 0.00233 | 0.02113 | 0.0742 | 723 | 867 | 560 |
| Antelope (Lancaster) – Vincent 230 kV #2 | 230 | 30.9 | HV230_2B | 0.00233 | 0.02113 | 0.0742 | 723 | 867 | 560 |
| Vincent – Sylmar 230 kV #1 | 230 | 45.1 | HV230_2B | 0.00341 | 0.03087 | 0.1084 | 723 | 867 | 560 |
| Vincent – Sylmar 230 kV #2 | 230 | 45.1 | HV230_2B | 0.00341 | 0.03087 | 0.1084 | 723 | 867 | 560 |
| Vincent – Moorpark (Ventura) 230 kV #1 | 230 | 87.2 | HV230_2B | 0.00656 | 0.05957 | 0.2097 | 723 | 867 | 544 |
| Vincent – Moorpark (Ventura) 230 kV #2 | 230 | 87.2 | HV230_2B | 0.00656 | 0.05957 | 0.2097 | 723 | 867 | 544 |
| Sylmar – Moorpark (Ventura) 230 kV #1 | 230 | 44.3 | HV230_2B | 0.00334 | 0.03030 | 0.1064 | 723 | 867 | 560 |
| Sylmar – Moorpark (Ventura) 230 kV #2 | 230 | 44.3 | HV230_2B | 0.00334 | 0.03030 | 0.1064 | 723 | 867 | 560 |
| Moorpark (Ventura) – Goleta (Santa Barbara) 230 kV #1 | 230 | 99.3 | HV230_1 | 0.01491 | 0.09383 | 0.1732 | 250 | 300 | 372 |
| Moorpark (Ventura) – Goleta (Santa Barbara) 230 kV #2 | 230 | 99.3 | HV230_1 | 0.01491 | 0.09383 | 0.1732 | 250 | 300 | 372 |
| Sylmar – Scattergood (El Segundo) 230 kV #1 | 230 | 50.6 | HV230_2B | 0.00382 | 0.03464 | 0.1217 | 723 | 867 | 560 |
| Sylmar – Scattergood (El Segundo) 230 kV #2 | 230 | 50.6 | HV230_2B | 0.00382 | 0.03464 | 0.1217 | 723 | 867 | 560 |
| Sylmar – Scattergood (El Segundo) 230 kV #3 | 230 | 50.6 | HV230_2B | 0.00382 | 0.03464 | 0.1217 | 723 | 867 | 560 |
| Sylmar – Laguna Bell (Los Angeles) 230 kV #1 | 230 | 54.9 | HV230_2B | 0.00414 | 0.03753 | 0.1319 | 723 | 867 | 560 |
| Sylmar – Laguna Bell (Los Angeles) 230 kV #2 | 230 | 54.9 | HV230_2B | 0.00414 | 0.03753 | 0.1319 | 723 | 867 | 560 |
| Vincent – Laguna Bell (Los Angeles) 230 kV #1 | 230 | 70.7 | HV230_2B | 0.00532 | 0.04831 | 0.1699 | 723 | 867 | 560 |
| Vincent – Laguna Bell (Los Angeles) 230 kV #2 | 230 | 70.7 | HV230_2B | 0.00532 | 0.04831 | 0.1699 | 723 | 867 | 560 |
| Vincent – Laguna Bell (Los Angeles) 230 kV #3 | 230 | 70.7 | HV230_2B | 0.00532 | 0.04831 | 0.1699 | 723 | 867 | 560 |
| Laguna Bell (Los Angeles) – Haynes (Long Beach) 230 kV #1 | 230 | 28.3 | HV230_2B | 0.00214 | 0.01940 | 0.0681 | 723 | 867 | 560 |
| Laguna Bell (Los Angeles) – Haynes (Long Beach) 230 kV #2 | 230 | 28.3 | HV230_2B | 0.00214 | 0.01940 | 0.0681 | 723 | 867 | 560 |
| Scattergood (El Segundo) – Haynes (Long Beach) 230 kV | 230 | 40.1 | HV230_2B | 0.00303 | 0.02747 | 0.0965 | 723 | 867 | 560 |
| Laguna Bell (Los Angeles) – Mira Loma 230 kV #1 | 230 | 64.5 | HV230_2B | 0.00486 | 0.04409 | 0.1550 | 723 | 867 | 560 |
| Laguna Bell (Los Angeles) – Mira Loma 230 kV #2 | 230 | 64.5 | HV230_2B | 0.00486 | 0.04409 | 0.1550 | 723 | 867 | 560 |
| Haynes (Long Beach) – Barre (Orange County) 230 kV #1 | 230 | 13.7 | HV230_2B | 0.00103 | 0.00936 | 0.0329 | 723 | 867 | 560 |
| Haynes (Long Beach) – Barre (Orange County) 230 kV #2 | 230 | 13.7 | HV230_2B | 0.00103 | 0.00936 | 0.0329 | 723 | 867 | 560 |
| Barre (Orange County) – Serrano 230 kV #1 | 230 | 30.4 | HV230_2B | 0.00229 | 0.02080 | 0.0730 | 723 | 867 | 560 |
| Barre (Orange County) – Serrano 230 kV #2 | 230 | 30.4 | HV230_2B | 0.00229 | 0.02080 | 0.0730 | 723 | 867 | 560 |
| Serrano – Santiago (Irvine) 230 kV #1 | 230 | 15.8 | HV230_2B | 0.00119 | 0.01080 | 0.0379 | 723 | 867 | 560 |
| Serrano – Santiago (Irvine) 230 kV #2 | 230 | 15.8 | HV230_2B | 0.00119 | 0.01080 | 0.0379 | 723 | 867 | 560 |
| Serrano – Santiago (Irvine) 230 kV #3 | 230 | 15.8 | HV230_2B | 0.00119 | 0.01080 | 0.0379 | 723 | 867 | 560 |
| Serrano – Santiago (Irvine) 230 kV #4 | 230 | 15.8 | HV230_2B | 0.00119 | 0.01080 | 0.0379 | 723 | 867 | 560 |
| Mira Loma – Vista (San Bernardino) 230 kV #1 | 230 | 28.5 | HV230_2B | 0.00215 | 0.01948 | 0.0684 | 723 | 867 | 560 |
| Mira Loma – Vista (San Bernardino) 230 kV #2 | 230 | 28.5 | HV230_2B | 0.00215 | 0.01948 | 0.0684 | 723 | 867 | 560 |
| Vista (San Bernardino) – Devers (Palm Springs) 230 kV #1 | 230 | 81.5 | HV230_2B | 0.00614 | 0.05570 | 0.1960 | 723 | 867 | 557 |
| Vista (San Bernardino) – Devers (Palm Springs) 230 kV #2 | 230 | 81.5 | HV230_2B | 0.00614 | 0.05570 | 0.1960 | 723 | 867 | 557 |
| Mira Loma – Serrano 230 kV #1 | 230 | 25.6 | HV230_2B | 0.00193 | 0.01752 | 0.0615 | 723 | 867 | 560 |
| Mira Loma – Serrano 230 kV #2 | 230 | 25.6 | HV230_2B | 0.00193 | 0.01752 | 0.0615 | 723 | 867 | 560 |
| Santiago (Irvine) – San Onofre 230 kV #1 | 230 | 48.4 | HV230_2B | 0.00365 | 0.03311 | 0.1163 | 723 | 867 | 560 |
| Santiago (Irvine) – San Onofre 230 kV #2 | 230 | 48.4 | HV230_2B | 0.00365 | 0.03311 | 0.1163 | 723 | 867 | 560 |
| San Onofre – Encina (Carlsbad) 230 kV #1 | 230 | 37.7 | HV230_2B | 0.00284 | 0.02577 | 0.0905 | 723 | 867 | 560 |
| San Onofre – Encina (Carlsbad) 230 kV #2 | 230 | 37.7 | HV230_2B | 0.00284 | 0.02577 | 0.0905 | 723 | 867 | 560 |
| Encina (Carlsbad) – Mission (San Diego) 230 kV | 230 | 50.6 | HV230_2B | 0.00382 | 0.03459 | 0.1215 | 723 | 867 | 560 |
| Encina (Carlsbad) – Sycamore Canyon 230 kV | 230 | 42.7 | HV230_2B | 0.00323 | 0.02925 | 0.1027 | 723 | 867 | 560 |
| Sycamore Canyon – Mission (San Diego) 230 kV #1 | 230 | 23.6 | HV230_2B | 0.00179 | 0.01618 | 0.0568 | 723 | 867 | 560 |
| Sycamore Canyon – Mission (San Diego) 230 kV #2 | 230 | 23.6 | HV230_2B | 0.00179 | 0.01618 | 0.0568 | 723 | 867 | 560 |
| Mission (San Diego) – Miguel 230 kV #1 | 230 | 31.3 | HV230_2B | 0.00237 | 0.02145 | 0.0753 | 723 | 867 | 560 |
| Mission (San Diego) – Miguel 230 kV #2 | 230 | 31.3 | HV230_2B | 0.00237 | 0.02145 | 0.0753 | 723 | 867 | 560 |
| Sycamore Canyon – Miguel 230 kV #1 | 230 | 35.1 | HV230_2B | 0.00265 | 0.02402 | 0.0844 | 723 | 867 | 560 |
| Sycamore Canyon – Miguel 230 kV #2 | 230 | 35.1 | HV230_2B | 0.00265 | 0.02402 | 0.0844 | 723 | 867 | 560 |
| Miguel – Otay Mesa 230 kV #1 | 230 | 16.6 | HV230_2B | 0.00126 | 0.01137 | 0.0399 | 723 | 867 | 560 |
| Miguel – Otay Mesa 230 kV #2 | 230 | 16.6 | HV230_2B | 0.00126 | 0.01137 | 0.0399 | 723 | 867 | 560 |
| Otay Mesa – Mission (San Diego) 230 kV | 230 | 34.8 | HV230_2B | 0.00263 | 0.02382 | 0.0836 | 723 | 867 | 560 |
| Metcalf (San José) – Evergreen 60 kV #1 | 60 | 11.5 | SUB60 | 0.03690 | 0.13393 | 0.0016 | 76 | 91 | 33 |
| Metcalf (San José) – Evergreen 60 kV #2 | 60 | 11.5 | SUB60 | 0.03690 | 0.13393 | 0.0016 | 76 | 91 | 33 |
| Metcalf (San José) – Evergreen 60 kV #3 | 60 | 11.5 | SUB60 | 0.03690 | 0.13393 | 0.0016 | 76 | 91 | 33 |

## Transformers

| Bank | MVA | X (% own base) | X/R | Vector group | X (pu on 100 MVA) |
|---|---|---|---|---|---|
| Round Mountain 500/230 kV bank 1 | 1120 | 10 | 50 | YNa0d1 | 0.00893 |
| Table Mountain 500/230 kV bank 1 | 1120 | 10 | 50 | YNa0d1 | 0.00893 |
| Table Mountain 500/230 kV bank 2 | 1120 | 10 | 50 | YNa0d1 | 0.00893 |
| Vaca-Dixon 500/230 kV bank 1 | 1120 | 10 | 50 | YNa0d1 | 0.00893 |
| Vaca-Dixon 500/230 kV bank 2 | 1120 | 10 | 50 | YNa0d1 | 0.00893 |
| Tesla 500/230 kV bank 1 | 1120 | 10 | 50 | YNa0d1 | 0.00893 |
| Tesla 500/230 kV bank 2 | 1120 | 10 | 50 | YNa0d1 | 0.00893 |
| Tesla 500/230 kV bank 3 | 1120 | 10 | 50 | YNa0d1 | 0.00893 |
| Metcalf (San José) 500/230 kV bank 1 | 1120 | 10 | 50 | YNa0d1 | 0.00893 |
| Metcalf (San José) 500/230 kV bank 2 | 1120 | 10 | 50 | YNa0d1 | 0.00893 |
| Moss Landing 500/230 kV bank 1 | 1120 | 10 | 50 | YNa0d1 | 0.00893 |
| Moss Landing 500/230 kV bank 2 | 1120 | 10 | 50 | YNa0d1 | 0.00893 |
| Gates 500/230 kV bank 1 | 1120 | 10 | 50 | YNa0d1 | 0.00893 |
| Gates 500/230 kV bank 2 | 1120 | 10 | 50 | YNa0d1 | 0.00893 |
| Westlands 500/230 kV bank 1 | 1120 | 10 | 50 | YNa0d1 | 0.00893 |
| Westlands 500/230 kV bank 2 | 1120 | 10 | 50 | YNa0d1 | 0.00893 |
| Westlands 500/230 kV bank 3 | 1120 | 10 | 50 | YNa0d1 | 0.00893 |
| Antelope (Lancaster) 500/230 kV bank 1 | 1120 | 10 | 50 | YNa0d1 | 0.00893 |
| Antelope (Lancaster) 500/230 kV bank 2 | 1120 | 10 | 50 | YNa0d1 | 0.00893 |
| Antelope (Lancaster) 500/230 kV bank 3 | 1120 | 10 | 50 | YNa0d1 | 0.00893 |
| Midway 500/230 kV bank 1 | 1120 | 10 | 50 | YNa0d1 | 0.00893 |
| Midway 500/230 kV bank 2 | 1120 | 10 | 50 | YNa0d1 | 0.00893 |
| Midway 500/230 kV bank 3 | 1120 | 10 | 50 | YNa0d1 | 0.00893 |
| Vincent 500/230 kV bank 1 | 1120 | 10 | 50 | YNa0d1 | 0.00893 |
| Vincent 500/230 kV bank 2 | 1120 | 10 | 50 | YNa0d1 | 0.00893 |
| Vincent 500/230 kV bank 3 | 1120 | 10 | 50 | YNa0d1 | 0.00893 |
| Mira Loma 500/230 kV bank 1 | 1120 | 10 | 50 | YNa0d1 | 0.00893 |
| Mira Loma 500/230 kV bank 2 | 1120 | 10 | 50 | YNa0d1 | 0.00893 |
| Mira Loma 500/230 kV bank 3 | 1120 | 10 | 50 | YNa0d1 | 0.00893 |
| Serrano 500/230 kV bank 1 | 1120 | 10 | 50 | YNa0d1 | 0.00893 |
| Serrano 500/230 kV bank 2 | 1120 | 10 | 50 | YNa0d1 | 0.00893 |
| Serrano 500/230 kV bank 3 | 1120 | 10 | 50 | YNa0d1 | 0.00893 |
| Serrano 500/230 kV bank 4 | 1120 | 10 | 50 | YNa0d1 | 0.00893 |
| Devers (Palm Springs) 500/230 kV bank 1 | 1120 | 10 | 50 | YNa0d1 | 0.00893 |
| Devers (Palm Springs) 500/230 kV bank 2 | 1120 | 10 | 50 | YNa0d1 | 0.00893 |
| Miguel 500/230 kV bank 1 | 1120 | 10 | 50 | YNa0d1 | 0.00893 |
| Miguel 500/230 kV bank 2 | 1120 | 10 | 50 | YNa0d1 | 0.00893 |
| Miguel 500/230 kV bank 3 | 1120 | 10 | 50 | YNa0d1 | 0.00893 |
| Imperial Valley 500/230 kV bank 1 | 1120 | 10 | 50 | YNa0d1 | 0.00893 |
| Imperial Valley 500/230 kV bank 2 | 1120 | 10 | 50 | YNa0d1 | 0.00893 |
| Cottonwood 230/115 kV bank 1 | 200 | 10 | 35 | YNyn0d1 | 0.05000 |
| Metcalf (San José) 230/60 kV bank 1 | 200 | 11 | 35 | YNyn0d1 | 0.05500 |
| Metcalf (San José) 230/60 kV bank 2 | 200 | 11 | 35 | YNyn0d1 | 0.05500 |
| Moss Landing Unit 1 Gas turbine 1 step-up 18/230 kV | 220 | 12 | 50 | YNd1 | 0.05455 |
| Moss Landing Unit 1 Gas turbine 2 step-up 18/230 kV | 220 | 12 | 50 | YNd1 | 0.05455 |
| Moss Landing Unit 1 Steam turbine step-up 18/230 kV | 220 | 12 | 50 | YNd1 | 0.05455 |

## Plants and interties

| Plant | Bus | Technology | MW | Variable cost ($/MWh) | Notes |
|---|---|---|---|---|---|
| Pacific Northwest (California–Oregon Intertie) | MALIN-500 | Import over AC ties | 3600 | 1400 MW @ 29; 1200 MW @ 42; 1000 MW @ 58 | external response 12000 MW |
| Pacific DC Intertie (from Celilo, Oregon) | SYLMAR-230 | Import over a DC link | 3100 | 1800 MW @ 31; 1300 MW @ 44 |  |
| Desert Southwest (Palo Verde hub) | PALO_VERDE-500 | Import over AC ties | 3200 | 1200 MW @ 33; 1000 MW @ 45; 1000 MW @ 60 | external response 12000 MW |
| Nevada (Eldorado / Hoover) | ELDORADO-500 | Import over AC ties | 2200 | 800 MW @ 36; 700 MW @ 47; 700 MW @ 62 | external response 6000 MW |
| Diablo Canyon | DIABLO-500 | Nuclear (PWR) | 2240 | 9.8 |  |
| Pit River hydro | PIT_RIVER-230 | Hydroelectric | 750 | 0.0 | daily water CF 0.45 |
| Oroville (Hyatt) hydro | TABLE_MTN-230 | Hydroelectric | 850 | 0.0 | daily water CF 0.4 |
| Stanislaus & Mokelumne hydro | BELLOTA-230 | Hydroelectric | 500 | 0.0 | daily water CF 0.4 |
| Big Creek hydro | BIG_CREEK-230 | Hydroelectric | 1000 | 0.0 | daily water CF 0.38 |
| Helms pumped storage | HELMS-230 | Pumped-storage hydro | 1200 | 0.0 | 8 h storage |
| The Geysers | GEYSERS-230 | Geothermal | 725 | 0.0 |  |
| Salton Sea geothermal | IMPERIAL_VALLEY-230 | Geothermal | 450 | 0.0 |  |
| Cosumnes | RANCHO_SECO-230 | Gas combined cycle | 600 | 45.0 |  |
| Delta / Los Medanos / Gateway | CONTRA_COSTA-230 | Gas combined cycle | 1500 | 46.3 | reliability must-run |
| Metcalf Energy Center | METCALF-230 | Gas combined cycle | 600 | 45.7 | reliability must-run |
| Moss Landing Unit 1 | MOSS_LANDING-230 | Gas combined cycle | 510 | 45.3 |  |
| Moss Landing Unit 2 | MOSS_LANDING-230 | Gas combined cycle | 510 | 45.3 |  |
| La Paloma / Sunrise | MIDWAY-230 | Gas combined cycle | 1600 | 46.9 |  |
| Valley Generating Station | SYLMAR-230 | Gas combined cycle | 580 | 47.5 | reliability must-run |
| Scattergood | SCATTERGOOD-230 | Gas combined cycle | 800 | 47.2 | reliability must-run |
| Haynes / Alamitos | HAYNES-230 | Gas combined cycle | 1600 | 46.6 | reliability must-run |
| Inland Empire Energy Center | MIRA_LOMA-230 | Gas combined cycle | 800 | 46.0 |  |
| Mountainview | VISTA-230 | Gas combined cycle | 1050 | 45.3 |  |
| Huntington Beach | BARRE-230 | Gas combined cycle | 640 | 45.7 |  |
| Blythe | COLORADO_RIVER-500 | Gas combined cycle | 500 | 47.5 |  |
| Palomar | SYCAMORE-230 | Gas combined cycle | 565 | 46.0 | reliability must-run |
| Otay Mesa | OTAY_MESA-230 | Gas combined cycle | 600 | 46.3 | reliability must-run |
| Sacramento local gas (SMUD) | ELVERTA-230 | Gas combined cycle | 500 | 48.1 | reliability must-run |
| Marsh Landing peakers | CONTRA_COSTA-230 | Gas combustion turbine (peaker) | 500 | 64.7 |  |
| Fresno peakers | HERNDON-230 | Gas combustion turbine (peaker) | 300 | 67.1 |  |
| Panoche peakers | GATES-230 | Gas combustion turbine (peaker) | 400 | 65.3 |  |
| Ormond / Mandalay peakers | MOORPARK-230 | Gas combustion turbine (peaker) | 1500 | 68.4 |  |
| El Segundo peakers | SCATTERGOOD-230 | Gas combustion turbine (peaker) | 500 | 64.1 |  |
| Alamitos peakers | HAYNES-230 | Gas combustion turbine (peaker) | 1000 | 66.5 |  |
| Walnut Creek peakers | MIRA_LOMA-230 | Gas combustion turbine (peaker) | 500 | 63.5 |  |
| San Bernardino peakers | VISTA-230 | Gas combustion turbine (peaker) | 400 | 67.8 |  |
| Sentinel peakers | DEVERS-230 | Gas combustion turbine (peaker) | 850 | 62.9 |  |
| Carlsbad peakers | ENCINA-230 | Gas combustion turbine (peaker) | 500 | 62.3 |  |
| Kern oil-field cogeneration | MIDWAY-230 | Gas cogeneration | 800 | 55.8 |  |
| Kern River cogeneration | MAGUNDEN-230 | Gas cogeneration | 300 | 55.8 |  |
| Humboldt Bay | HUMBOLDT-115 | Gas reciprocating engines | 163 | 54.6 | reliability must-run |
| Solano wind (Montezuma Hills) | VACA_DIXON-230 | Wind | 900 | 0.0 |  |
| Altamont Pass wind | TESLA-230 | Wind | 400 | 0.0 |  |
| Tehachapi Pass wind | WINDHUB-500 | Wind | 3200 | 0.0 |  |
| San Gorgonio Pass wind | DEVERS-230 | Wind | 600 | 0.0 |  |
| Sacramento solar | RANCHO_SECO-230 | Solar photovoltaic | 160 | 0.0 |  |
| Fresno County solar | HERNDON-230 | Solar photovoltaic | 300 | 0.0 |  |
| Westlands solar | WESTLANDS-230 | Solar photovoltaic | 3000 | 0.0 |  |
| Kings & Tulare solar | GATES-230 | Solar photovoltaic | 1200 | 0.0 |  |
| Topaz / California Flats solar | CARRIZO-230 | Solar photovoltaic | 850 | 0.0 |  |
| Kern solar | MAGUNDEN-230 | Solar photovoltaic | 1800 | 0.0 |  |
| Antelope Valley solar | ANTELOPE-230 | Solar photovoltaic | 3000 | 0.0 |  |
| Desert Sunlight / Blythe solar | COLORADO_RIVER-500 | Solar photovoltaic | 2500 | 0.0 |  |
| Imperial Valley solar | IMPERIAL_VALLEY-230 | Solar photovoltaic | 1300 | 0.0 |  |
| Moss Landing battery | MOSS_LANDING-230 | Battery storage (4 h) | 750 | 0.0 | 4 h storage |
| Tracy battery | TESLA-230 | Battery storage (4 h) | 300 | 0.0 | 4 h storage |
| San José battery | METCALF-230 | Battery storage (4 h) | 200 | 0.0 | 4 h storage |
| Westlands battery | WESTLANDS-230 | Battery storage (4 h) | 500 | 0.0 | 4 h storage |
| Kern battery | MAGUNDEN-230 | Battery storage (4 h) | 800 | 0.0 | 4 h storage |
| Antelope Valley battery | ANTELOPE-230 | Battery storage (4 h) | 600 | 0.0 | 4 h storage |
| Alamitos battery | HAYNES-230 | Battery storage (4 h) | 400 | 0.0 | 4 h storage |
| Inland Empire battery | MIRA_LOMA-230 | Battery storage (4 h) | 600 | 0.0 | 4 h storage |
| Redlands battery | VISTA-230 | Battery storage (4 h) | 400 | 0.0 | 4 h storage |
| Coachella battery | DEVERS-230 | Battery storage (4 h) | 300 | 0.0 | 4 h storage |
| Desert battery | COLORADO_RIVER-500 | Battery storage (4 h) | 1000 | 0.0 | 4 h storage |
| Otay battery | OTAY_MESA-230 | Battery storage (4 h) | 400 | 0.0 | 4 h storage |
| Potrero converter reactive support (Trans Bay Cable) | MARTIN-230 | Synchronous condenser | 0 | 0.0 | 250 MVAr |
| Metcalf static var compensator | METCALF-230 | Synchronous condenser | 0 | 0.0 | 400 MVAr |
| Sacramento static var compensator | ELVERTA-230 | Synchronous condenser | 0 | 0.0 | 400 MVAr |
| Talega synchronous condensers | SAN_ONOFRE-230 | Synchronous condenser | 0 | 0.0 | 450 MVAr |
| Miguel synchronous condensers | MIGUEL-230 | Synchronous condenser | 0 | 0.0 | 450 MVAr |
| Santiago synchronous condensers | SANTIAGO-230 | Synchronous condenser | 0 | 0.0 | 400 MVAr |
| Laguna Bell static var compensator | LAGUNA_BELL-230 | Synchronous condenser | 0 | 0.0 | 400 MVAr |
| Goleta synchronous condenser | GOLETA-230 | Synchronous condenser | 0 | 0.0 | 150 MVAr |

## Loads (reference peak)

| Bus | Peak MW | Power factor | Rooftop solar MW |
|---|---|---|---|
| ROUND_MTN-230 | 250 | 0.97 | 90 |
| COTTONWOOD-230 | 350 | 0.97 | 130 |
| HUMBOLDT-115 | 140 | 0.97 | 30 |
| TABLE_MTN-230 | 700 | 0.97 | 280 |
| ELVERTA-230 | 2900 | 0.97 | 1000 |
| RANCHO_SECO-230 | 250 | 0.97 | 90 |
| VACA_DIXON-230 | 800 | 0.97 | 330 |
| LAKEVILLE-230 | 1100 | 0.97 | 380 |
| GEYSERS-230 | 40 | 0.97 | 0 |
| CONTRA_COSTA-230 | 1100 | 0.97 | 380 |
| MORAGA-230 | 1700 | 0.97 | 500 |
| MARTIN-230 | 900 | 0.96 | 150 |
| RAVENSWOOD-230 | 1200 | 0.97 | 330 |
| NEWARK-230 | 1300 | 0.97 | 420 |
| TESLA-230 | 500 | 0.97 | 200 |
| METCALF-230 | 1500 | 0.97 | 450 |
| EVERGREEN-60 | 70 | 0.97 | 25 |
| MOSS_LANDING-230 | 750 | 0.97 | 220 |
| BELLOTA-230 | 1600 | 0.97 | 650 |
| HERNDON-230 | 1600 | 0.97 | 700 |
| WESTLANDS-230 | 500 | 0.92 | 200 |
| GATES-230 | 1000 | 0.93 | 420 |
| CARRIZO-230 | 300 | 0.97 | 120 |
| MIDWAY-230 | 450 | 0.9 | 60 |
| MAGUNDEN-230 | 1200 | 0.97 | 480 |
| BIG_CREEK-230 | 40 | 0.97 | 0 |
| ANTELOPE-230 | 800 | 0.97 | 380 |
| VINCENT-230 | 600 | 0.97 | 260 |
| SYLMAR-230 | 2200 | 0.97 | 700 |
| MOORPARK-230 | 1300 | 0.97 | 480 |
| GOLETA-230 | 330 | 0.97 | 110 |
| SCATTERGOOD-230 | 2400 | 0.97 | 600 |
| LAGUNA_BELL-230 | 3200 | 0.97 | 800 |
| HAYNES-230 | 1800 | 0.97 | 450 |
| MIRA_LOMA-230 | 2400 | 0.97 | 900 |
| VISTA-230 | 1500 | 0.97 | 600 |
| SERRANO-230 | 1800 | 0.97 | 600 |
| BARRE-230 | 1600 | 0.97 | 500 |
| SANTIAGO-230 | 1400 | 0.97 | 480 |
| DEVERS-230 | 1300 | 0.95 | 520 |
| SAN_ONOFRE-230 | 200 | 0.97 | 70 |
| ENCINA-230 | 1100 | 0.97 | 420 |
| SYCAMORE-230 | 1000 | 0.97 | 420 |
| MISSION-230 | 1700 | 0.97 | 520 |
| OTAY_MESA-230 | 500 | 0.97 | 170 |
| MIGUEL-230 | 400 | 0.97 | 160 |
| IMPERIAL_VALLEY-230 | 900 | 0.93 | 250 |
