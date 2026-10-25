/**
 * ArmadaCodexSchema — fleet codex for the KANHA demo fleet.
 *
 * Object-oriented JSON schema inspired by shiplab/vesseljs:
 *   vessel -> particulars -> layout (compartments along the hull)
 *          -> structural part tree (Tier-1 sectors -> Tier-2 members)
 *          -> machinery -> telemetry (CII, yield, cargo, crew)
 *          -> 12-month port-to-port voyage history.
 *
 * All vessels, identifiers (IMO/MMSI/call signs) and crew are fictional demo data.
 */

/* ------------------------------------------------------------------ */
/*  Deterministic PRNG so every boot shows identical telemetry          */
/* ------------------------------------------------------------------ */
export function seededRandom(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ------------------------------------------------------------------ */
/*  Geography: ports, lane waypoints, simplified coastlines             */
/* ------------------------------------------------------------------ */
export const PORTS = {
  SINGAPORE: { name: 'Singapore', unlocode: 'SGSIN', lat: 1.26, lon: 103.82 },
  SHANGHAI: { name: 'Shanghai', unlocode: 'CNSHA', lat: 31.23, lon: 121.8 },
  NINGBO: { name: 'Ningbo-Zhoushan', unlocode: 'CNNGB', lat: 29.87, lon: 122.1 },
  HONG_KONG: { name: 'Hong Kong', unlocode: 'HKHKG', lat: 22.3, lon: 114.17 },
  PORT_SAID: { name: 'Port Said', unlocode: 'EGPSD', lat: 31.26, lon: 32.3 },
  SUEZ_APPROACH: { name: 'Suez Approach', unlocode: 'EGSUZ', lat: 29.92, lon: 32.55 },
  ROTTERDAM: { name: 'Rotterdam Europort', unlocode: 'NLRTM', lat: 51.95, lon: 4.14 },
  HAMBURG: { name: 'Hamburg', unlocode: 'DEHAM', lat: 53.54, lon: 9.97 },
  ANTWERP: { name: 'Antwerp', unlocode: 'BEANR', lat: 51.27, lon: 4.35 },
  ALGECIRAS: { name: 'Algeciras', unlocode: 'ESALG', lat: 36.13, lon: -5.43 },
  JEDDAH: { name: 'Jeddah', unlocode: 'SAJED', lat: 21.48, lon: 39.17 },
  COLOMBO: { name: 'Colombo', unlocode: 'LKCMB', lat: 6.95, lon: 79.84 },
  RAS_TANURA: { name: 'Ras Tanura', unlocode: 'SARTA', lat: 26.64, lon: 50.16 },
  FUJAIRAH: { name: 'Fujairah', unlocode: 'AEFJR', lat: 25.17, lon: 56.36 },
  ULSAN: { name: 'Ulsan', unlocode: 'KRUSN', lat: 35.5, lon: 129.38 },
  BONNY: { name: 'Bonny Terminal', unlocode: 'NGBON', lat: 4.2, lon: 7.15 },
  LAS_PALMAS: { name: 'Las Palmas', unlocode: 'ESLPA', lat: 28.14, lon: -15.43 },
  CAPE_TOWN: { name: 'Cape Town OPL', unlocode: 'ZACPT', lat: -33.9, lon: 18.43 },
  HOUSTON: { name: 'Houston', unlocode: 'USHOU', lat: 29.73, lon: -95.27 },
  JEBEL_ALI: { name: 'Jebel Ali', unlocode: 'AEJEA', lat: 25.01, lon: 55.06 },
  MUMBAI: { name: 'Mumbai (JNPT)', unlocode: 'INNSA', lat: 18.95, lon: 72.95 },
  KANDLA: { name: 'Kandla', unlocode: 'INIXY', lat: 23.03, lon: 70.22 },
  PORT_HEDLAND: { name: 'Port Hedland', unlocode: 'AUPHE', lat: -20.31, lon: 118.58 },
  QINGDAO: { name: 'Qingdao', unlocode: 'CNTAO', lat: 36.07, lon: 120.32 },
  TUBARAO: { name: 'Tubarão', unlocode: 'BRTUB', lat: -20.29, lon: -40.24 },
  SALDANHA: { name: 'Saldanha Bay', unlocode: 'ZASDB', lat: -33.03, lon: 17.95 },
  RICHARDS_BAY: { name: 'Richards Bay', unlocode: 'ZARCB', lat: -28.8, lon: 32.08 },
  PARADIP: { name: 'Paradip', unlocode: 'INPRT', lat: 20.26, lon: 86.67 },
  MUNDRA: { name: 'Mundra', unlocode: 'INMUN', lat: 22.74, lon: 69.7 },
  INDIAN_OCEAN: { name: 'Arabian Sea (underway)', unlocode: '—', lat: 12.5, lon: 68.2 },
  RAS_LAFFAN: { name: 'Ras Laffan', unlocode: 'QARLF', lat: 25.9, lon: 51.55 },
  FUTTSU: { name: 'Futtsu (Tokyo Bay)', unlocode: 'JPFTT', lat: 35.3, lon: 139.8 },
  INCHEON: { name: 'Incheon LNG', unlocode: 'KRINC', lat: 37.4, lon: 126.6 },
  DAHEJ: { name: 'Dahej LNG', unlocode: 'INDAH', lat: 21.7, lon: 72.53 },
  MALACCA: { name: 'Malacca Strait (underway)', unlocode: '—', lat: 2.8, lon: 101.1 },
  YOKOHAMA: { name: 'Yokohama', unlocode: 'JPYOK', lat: 35.45, lon: 139.65 },
  NAGOYA: { name: 'Nagoya', unlocode: 'JPNGO', lat: 35.05, lon: 136.88 },
  ZEEBRUGGE: { name: 'Zeebrugge', unlocode: 'BEZEE', lat: 51.33, lon: 3.2 },
  SOUTHAMPTON: { name: 'Southampton', unlocode: 'GBSOU', lat: 50.9, lon: -1.4 },
  BREMERHAVEN: { name: 'Bremerhaven', unlocode: 'DEBRV', lat: 53.55, lon: 8.58 },
  BALTIMORE: { name: 'Baltimore', unlocode: 'USBAL', lat: 39.25, lon: -76.58 },
  ENGLISH_CHANNEL: { name: 'English Channel (underway)', unlocode: '—', lat: 50.4, lon: -0.8 }
};

/** Lane waypoints [lat, lon] that keep great-circle legs in open water. */
export const WP = {
  SG_STRAIT: [1.15, 104.1],
  MALACCA_N: [6.2, 96.8],
  DONDRA: [5.2, 80.6],
  ADEN_E: [13.0, 50.5],
  BAB: [12.6, 43.4],
  RED_SEA: [20.5, 38.4],
  SUEZ_S: [29.6, 32.6],
  PORT_SAID_N: [31.6, 32.4],
  CRETE_S: [34.2, 25.0],
  SICILY: [37.3, 11.5],
  ALBORAN: [36.0, -2.5],
  GIBRALTAR: [35.95, -5.8],
  ST_VINCENT: [36.9, -9.8],
  FINISTERRE: [43.2, -10.0],
  USHANT: [48.6, -5.9],
  DOVER: [51.0, 1.6],
  ELBE: [54.0, 7.8],
  HORMUZ: [26.4, 56.5],
  GULF_INNER: [26.8, 52.5],
  OMAN: [23.5, 60.0],
  ARABIAN: [16.0, 64.0],
  GOOD_HOPE: [-35.3, 18.5],
  AGULHAS: [-36.5, 23.0],
  SCS: [9.5, 110.0],
  SCS_N: [17.5, 114.5],
  LUZON: [20.8, 120.8],
  KYUSHU_S: [30.0, 132.5],
  TOKYO_APP: [34.6, 139.9],
  ECS: [29.5, 124.5],
  YELLOW: [35.0, 123.5],
  KOREA_STR: [34.0, 128.5],
  CANARIES: [27.5, -17.5],
  BULGE: [10.0, -19.5],
  GUINEA: [2.5, 3.5],
  SAT: [-25.0, -25.0],
  LOMBOK: [-8.9, 115.8],
  MAKASSAR: [-2.5, 118.2],
  CELEBES: [3.5, 123.0],
  PHIL_SEA: [15.0, 127.5],
  SUNDA: [-6.2, 105.8],
  KARIMATA: [-2.0, 108.6],
  IO_S: [-28.0, 60.0],
  IO_E: [-12.0, 95.0],
  FLORIDA: [24.3, -81.5],
  GOM: [25.5, -88.0],
  BAHAMAS: [27.0, -79.5],
  ATL_N: [43.0, -40.0],
  ATL_W: [40.0, -62.0],
  CHESAPEAKE: [36.95, -75.8],
  BAY_BENGAL: [12.0, 84.0],
  LACCADIVE: [10.0, 75.3]
};

/**
 * Simplified world coastline polygons, [lon, lat] rings. Used for the Mode A
 * globe dot-matrix + outlines and the Stage-2 voyage SVG map.
 */
export const LAND_POLYGONS = {
  northAmerica: [[-168,66],[-162,70],[-156,71.3],[-140,69.6],[-128,70],[-115,68.5],[-95,68],[-85,69.5],[-80,63],[-94,59],[-92,57],[-82,55],[-79,51.5],[-78,58],[-77,62],[-70,61],[-64,60],[-61,56],[-56,52],[-60,47],[-66,45],[-70,43.5],[-70.5,41.5],[-74,40.5],[-76,38],[-75.5,35.5],[-78,33.8],[-81,31.5],[-80,27],[-80.4,25.2],[-82,26.5],[-83,29.5],[-85,30],[-89,30.2],[-90,29.2],[-94,29.6],[-97.2,27.5],[-97.5,24],[-97.5,21.5],[-96,19],[-94.5,18.2],[-91,18.8],[-90.5,21],[-87,21.5],[-88,16],[-84,15.5],[-83.5,11.5],[-81.5,9],[-79,9.5],[-77.5,8.5],[-80,7.5],[-83,8.3],[-86,11],[-87.5,13],[-91,13.8],[-94,16],[-97,15.8],[-101,17.5],[-105.5,20.5],[-105.5,22.8],[-109.5,26.5],[-112.5,29.5],[-114.5,31.5],[-113,29],[-110,24],[-112,24.5],[-114.5,28],[-116,30.5],[-117.2,32.6],[-120.5,34.5],[-122.5,37.5],[-124,40.5],[-124.5,43],[-124,46.5],[-124.7,48.4],[-127,50.5],[-130.5,54],[-134,57.5],[-140,59.8],[-147,60.8],[-152,59],[-158,56.5],[-164,54.5],[-162,58.5],[-165,60.5],[-166,62],[-165,64.5],[-168,66]],
  arcticIslands: [[-120,71],[-90,74],[-80,76],[-70,79],[-80,83],[-100,80],[-120,77],[-125,73],[-120,71]],
  baffin: [[-80,63.5],[-65,62],[-62,66.5],[-68,70],[-77,72.5],[-90,73.5],[-85,70],[-82,68],[-76,67],[-74,65],[-80,63.5]],
  newfoundland: [[-59.3,47.6],[-55.5,51.6],[-52.7,49.6],[-52.7,46.7],[-55.5,46.9],[-59.3,47.6]],
  greenland: [[-73,78],[-60,82],[-35,83.5],[-20,82],[-18,77],[-22,72],[-25,69],[-32,68],[-40,65],[-43,60],[-48,61],[-52,64.5],[-54,67.5],[-55,71],[-60,76],[-73,78]],
  iceland: [[-22.5,63.9],[-14.5,64.3],[-13.6,65.2],[-16,66.5],[-22.5,66.4],[-24.3,65.5],[-22.5,63.9]],
  cuba: [[-85,21.8],[-82,23.2],[-77,22.2],[-74.2,20.2],[-77.7,19.9],[-80,21.8],[-85,21.8]],
  hispaniola: [[-74.4,18.4],[-72.8,19.9],[-70,19.7],[-68.4,18.6],[-71.3,17.6],[-74.4,18.4]],
  southAmerica: [[-77.5,8.5],[-75.5,10.8],[-72,12],[-68,10.6],[-62,10.7],[-60,8.5],[-57,6],[-52,5],[-50,1.5],[-48,-1],[-44,-2.5],[-39,-3.5],[-35,-5.5],[-35,-9],[-37,-12],[-39,-15],[-39.5,-19],[-41,-22],[-44,-23],[-48,-26],[-48.6,-28.5],[-52,-32],[-53.5,-34.5],[-57,-35],[-57.5,-38],[-62,-39],[-65,-41],[-64.5,-43],[-67.5,-46],[-66,-48],[-69,-51],[-68.5,-53],[-71,-54],[-74.5,-52],[-75.5,-48],[-74,-44],[-73.5,-41],[-73.5,-37],[-71.5,-32],[-71.3,-28],[-70.5,-23],[-70.2,-18.5],[-75,-15.5],[-77,-12],[-79,-8],[-81,-5],[-80.3,-1],[-79.8,1],[-78.5,2.5],[-77.3,4],[-77.5,7],[-77.5,8.5]],
  africa: [[-17,21],[-16,24],[-13,27.5],[-10,29.5],[-9.5,32],[-6.5,34],[-5.8,35.8],[-2,35.1],[1,36.5],[5,36.8],[10,37.3],[11,35.5],[10,34],[11.5,33],[15.5,32.3],[20,30.8],[20,32],[23,32.6],[25,31.7],[29,30.9],[32.3,31.3],[32.5,29.9],[33.5,27],[35.5,24],[37.2,21],[38.5,18],[39.7,15.5],[41.5,13.5],[43.3,12.5],[44.5,10.5],[51.2,11.8],[50.8,10],[49,6.5],[46,2],[41.5,-1.8],[39.5,-5],[39.3,-8],[40.5,-11],[40.5,-15],[37,-17.5],[35.3,-22],[35.5,-24],[32.8,-25.8],[32.5,-28.5],[30,-31.3],[27.5,-33.5],[25,-34],[20,-34.8],[18.4,-34],[17.8,-32],[16.5,-28.6],[15,-26.5],[14.5,-23],[12,-18],[11.8,-15.5],[13.5,-12],[13,-9],[12.2,-6],[9.5,-2.5],[9.6,1],[9.8,3.8],[8.5,4.5],[6,4.3],[4.5,6.3],[2,6.3],[-1,5],[-4,5.2],[-7.5,4.4],[-10,6],[-13,8],[-14.5,10.5],[-16.8,12.5],[-17.5,14.7],[-16.5,16.5],[-16,19],[-17,21]],
  madagascar: [[49.3,-12],[50.5,-15.5],[49.7,-17],[47.8,-22.5],[47,-25],[45.1,-25.5],[43.7,-23.5],[43.3,-21.5],[44.4,-19.5],[44,-17],[46.5,-15.7],[48,-13.5],[49.3,-12]],
  eurasia: [[-9.3,38.7],[-8.9,37],[-6,36.5],[-5.6,36],[-4.5,36.7],[-2,36.8],[0,38.5],[0.2,40],[3.2,41.9],[3,43.3],[5,43.4],[7.5,43.8],[9,44.4],[10.5,43],[12.3,41.7],[15.6,40],[15.6,38],[16.6,38.5],[17.1,39.4],[16.5,40],[18.5,40.1],[16.5,41.3],[14,42.5],[12.3,44.4],[12.3,45.4],[13.7,45.7],[15,44.7],[17.5,43],[19.4,42],[19.4,40.5],[21,38.2],[22.6,36.5],[24,38],[23,39.5],[23,40.5],[26,40.8],[28.9,41],[26.2,39.5],[26.5,38.3],[27.3,37],[29.5,36.3],[32.5,36.1],[36,36.8],[35.8,34.8],[35,33],[34.2,31.2],[34.9,29.5],[35,28],[36.5,25.5],[39,21.5],[41,18],[42.8,15],[43.4,12.7],[45,12.9],[49,14.2],[52.2,15.7],[55.4,17.7],[57.5,18.9],[59.8,22.5],[58.5,23.7],[56.4,24.9],[56.3,26.2],[55,25],[52,24],[51.6,25.9],[50.8,24.7],[50,26.5],[48.5,28.3],[48,30],[49.5,30],[51,28.5],[54,26.6],[56.5,27.1],[57.3,25.8],[61.5,25.2],[66.5,25.4],[67.5,24],[68.7,23.2],[70,22.6],[72.6,21.5],[72.8,19],[73.4,16],[74.7,13],[76.2,9.9],[77.5,8.1],[78.2,8.9],[79.3,10.3],[80.2,13],[80.1,15.5],[82.2,16.6],[84.8,19.2],[86.9,20.8],[88.5,21.8],[90,22],[91.8,22.4],[92.5,20.5],[94,18.5],[94.3,16],[97.6,16.5],[98.5,13],[98.6,10],[98.3,7.8],[100.3,5.2],[101.3,2.8],[103.4,1.4],[104.2,1.4],[103.5,4],[103.4,5.3],[102,6.2],[100.5,7.5],[100,9.5],[99.5,10.5],[100,13.4],[100.9,12.7],[102.3,12.2],[103,11],[104.8,8.6],[106.7,10.4],[109.2,11.6],[109.3,13.5],[108.5,15.5],[106.6,17.5],[105.7,19],[106.7,20.7],[108,21.5],[110.4,21],[111.8,21.6],[114,22.3],[116.5,23],[119,25.3],[120.4,27],[122,29.9],[121.3,31],[121.9,31.7],[120.8,32.5],[119.3,34.6],[120.3,36],[122.5,37],[121,37.7],[118.9,37.4],[118,38.5],[117.7,39],[119.2,39.8],[121.5,40.8],[122.2,40.4],[121.3,39],[122.6,39.6],[124.3,39.9],[125.3,37.7],[126.6,37.3],[126.4,34.6],[127.5,34.6],[129.3,35.2],[129.5,36.8],[128.3,38.6],[129.7,40.8],[129.9,42.4],[131.6,43],[133.1,42.8],[135.5,43.9],[138.5,47],[140.4,48.8],[140.5,52],[141.3,53.3],[137.8,54],[136.7,54.6],[140,56.5],[143,59.3],[148.5,59.3],[152.3,59],[156.5,57.5],[156.7,51],[160,53],[162.5,56.2],[163,59.7],[166,60.4],[170.5,60],[174,61.8],[179,62.3],[180,65],[180,69],[175,69.8],[170,70],[160,69.6],[150,71.4],[140,72.4],[130,71],[128,72.9],[120,73],[113,73.5],[110,76.7],[104,77.7],[100,76],[90,75.6],[85,73.3],[80,73.5],[72,72.8],[69,73],[66,69.2],[60,69.8],[55,68.4],[44,68.4],[41,67],[40,64.5],[37,63.8],[35,66.5],[41,67.5],[34,69.3],[28,71],[24,71],[19,70],[14,68],[12,65.5],[8,63.5],[5,61.5],[5.5,59],[7,58],[8,58.1],[10.5,59.4],[11.5,58.5],[12.5,56.5],[12.9,55.4],[14.2,55.4],[16,56.2],[16.5,57.5],[16.6,59],[18.5,59.6],[17.5,61],[17.5,62.5],[21,64.5],[22,65.8],[25.5,65],[24.5,64],[21.5,62.5],[21.4,60.6],[22.9,59.9],[28.2,60.5],[30,59.9],[28,59.5],[23.5,59.2],[23.5,58.3],[24.3,57.2],[21.5,57.3],[21,56],[21.2,55.2],[19.5,54.4],[18.5,54.8],[14.3,53.9],[11.5,54.2],[10.9,54.6],[10,55.7],[10.6,57.7],[8.5,57.1],[8.1,55.5],[8.6,54],[7,53.4],[5,53.3],[4.6,52.5],[3.6,51.5],[1.8,51],[1.6,50.2],[0.3,49.6],[-1.3,49.6],[-1.9,48.7],[-4.7,48.4],[-4.3,47.8],[-2.2,47.2],[-1.2,46],[-1.4,44.5],[-1.8,43.4],[-4.5,43.4],[-8,43.7],[-9.3,43],[-8.8,42],[-8.8,41],[-9.5,39.4],[-9.3,38.7]],
  britain: [[-5.7,50],[1.4,51.2],[1.7,52.7],[0,53.5],[-0.5,54.5],[-1.6,55.6],[-2,57],[-1.8,57.6],[-3.3,58.6],[-5,58.6],[-6,57.5],[-5.6,55.3],[-4.8,54.8],[-3.2,54.2],[-3,53.3],[-4.6,52.8],[-5.2,51.7],[-3.2,51.4],[-5.7,50]],
  ireland: [[-6,52],[-6,53.9],[-5.5,54.6],[-7.3,55.3],[-8.5,54.4],[-10,53.5],[-10.3,51.8],[-8.5,51.6],[-6,52]],
  svalbard: [[11,78.5],[16,80],[27,80],[22,77.5],[16,76.5],[11,78.5]],
  sriLanka: [[79.9,6.2],[80.6,5.9],[81.9,7.5],[81.2,8.7],[80.1,9.8],[79.8,8],[79.9,6.2]],
  sumatra: [[95.3,5.6],[97.5,5.2],[100.3,2.3],[104,-1],[106,-3.2],[105.8,-5.8],[104.5,-5.9],[102.3,-4],[100.3,-1],[98.6,1.7],[95.3,5.6]],
  java: [[105.2,-6.8],[108,-6.3],[111,-6.5],[114.5,-7.7],[114.4,-8.7],[110,-8.2],[106.5,-7.4],[105.2,-6.8]],
  borneo: [[109,1.5],[109.7,-1.2],[110.3,-3],[114.5,-4],[116.3,-3.5],[116.3,-1.5],[117.6,0.8],[118.9,1.3],[117.8,4.2],[119.2,5.3],[117,7],[115.4,5],[113,3.2],[111.3,2.5],[109.6,2],[109,1.5]],
  sulawesi: [[119.5,-5.5],[120.5,-5.5],[121.5,-2.8],[123.4,-1],[121,1.2],[125,1.5],[120.6,0.4],[119.7,-0.6],[119.5,-5.5]],
  newGuinea: [[131,-1],[134,-0.9],[137.5,-1.5],[141,-2.6],[145.5,-4.8],[147.6,-6.1],[147.8,-8],[150.5,-10.4],[147,-10.2],[143.5,-9],[142.5,-9.4],[141,-9],[139,-8.2],[138,-5.5],[135.2,-4.4],[132.5,-4],[131.9,-2.8],[131,-1]],
  luzon: [[120,18.5],[122.3,18.4],[122,16],[124,13.5],[121,13.8],[119.8,16],[120,18.5]],
  mindanao: [[122,7],[124.2,6.2],[126.5,6.5],[126,9],[123.5,8.5],[122,7]],
  taiwan: [[120.1,23],[121,22],[121.9,24.8],[121.5,25.3],[120.1,23]],
  japan: [[130.2,31.3],[131.4,31.5],[132,33.8],[135,33.5],[136.8,34.3],[139,34.7],[140.9,35.7],[141,38.3],[142,39.6],[141.4,41.4],[140,40.7],[139.8,38.8],[138.5,37.4],[136.7,37.1],[135.4,35.6],[132.6,35.4],[130.9,34],[129.7,33.2],[130.2,31.3]],
  hokkaido: [[140,41.5],[141.2,41.8],[143.3,42],[145.6,43.3],[144.3,44.1],[141.6,45.4],[141.5,43.3],[140,42.6],[140,41.5]],
  sakhalin: [[142,46],[143.5,49.3],[143,54.3],[142.2,53.5],[142,50],[141.8,46.5],[142,46]],
  australia: [[113.5,-22],[114.2,-26.3],[115,-29.5],[115.7,-33.5],[115,-34.3],[118,-35],[121.5,-33.8],[124,-33],[126,-32.3],[129,-31.7],[131.3,-31.5],[134,-32.6],[135.8,-34.8],[137.8,-33.5],[137.5,-35.6],[139.5,-35.9],[140.6,-38],[143.5,-38.8],[146.3,-39.1],[148,-37.8],[150,-37.5],[150.8,-34.5],[152.5,-32],[153.6,-28.5],[153.1,-25],[151,-23.5],[149.5,-22.4],[147.5,-19.3],[146.2,-18.5],[145.4,-15],[143.6,-14],[142.5,-10.7],[141.6,-12.8],[141.5,-15.5],[140.6,-17.5],[139.3,-17.3],[137.9,-16.3],[136,-15],[136.8,-12.2],[133.5,-11.7],[131.8,-11.3],[130,-12.8],[129.4,-14.9],[127.5,-14],[125.8,-14.6],[124.4,-16.3],[122.2,-17.5],[121,-19.5],[117.5,-20.7],[114.6,-21.8],[113.5,-22]],
  tasmania: [[144.6,-40.7],[148.3,-40.9],[148,-43.2],[146.5,-43.6],[145.2,-42.3],[144.6,-40.7]],
  newZealandN: [[172.7,-34.4],[174.8,-36.9],[178.5,-37.7],[177,-39.3],[175,-41.6],[174.6,-39.6],[173.8,-39.2],[174.5,-37.5],[172.7,-34.4]],
  newZealandS: [[172.7,-40.5],[174.3,-41.7],[172.8,-43.6],[171,-45],[169,-46.6],[166.5,-46],[168.3,-44],[170.8,-42.8],[172.7,-40.5]],
  antarctica: [[-180,-78],[-160,-78],[-150,-76],[-130,-74],[-100,-73],[-80,-73],[-60,-64],[-57,-63.5],[-62,-66],[-65,-69],[-60,-74],[-40,-78],[-20,-73],[0,-70],[20,-69.8],[40,-69],[60,-67.5],[80,-67],[100,-66],[120,-66.5],[140,-66.5],[160,-70],[170,-72],[180,-78],[180,-90],[-180,-90],[-180,-78]]
};

/** Inland seas cut out of the Eurasia polygon. */
export const WATER_POLYGONS = {
  blackSea: [[28,41.3],[29,41.2],[31,41.1],[33.4,42],[36,41.7],[38,40.9],[41.5,41.5],[41.7,42.6],[39.5,44],[38,44.8],[36.6,45.3],[35,45],[33.5,44.6],[32.5,45.4],[33.6,46.1],[31.5,46.6],[30.2,45.8],[29.6,45],[28.6,44.2],[27.6,42.5],[28,41.3]],
  caspian: [[47,44.5],[49.2,46.4],[51.2,47],[53,46.6],[53.2,45.3],[51.3,44.5],[52.8,41.8],[53.9,40.6],[53.9,37.3],[51.3,36.7],[49,37.6],[49.4,40.2],[47.6,41.2],[47.3,43],[47,44.5]]
};

function pointInRing(lon, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi + 1e-12) + xi) inside = !inside;
  }
  return inside;
}

function withBounds(rings) {
  return Object.values(rings).map((ring) => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [x, y] of ring) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    return { ring, minX, minY, maxX, maxY };
  });
}
let _landB = null;
let _waterB = null;

export function isLand(lat, lon) {
  _landB ??= withBounds(LAND_POLYGONS);
  _waterB ??= withBounds(WATER_POLYGONS);
  const hit = (b) => lon >= b.minX && lon <= b.maxX && lat >= b.minY && lat <= b.maxY && pointInRing(lon, lat, b.ring);
  for (const b of _waterB) if (hit(b)) return false;
  for (const b of _landB) if (hit(b)) return true;
  return false;
}

/* ------------------------------------------------------------------ */
/*  Voyage helpers                                                      */
/* ------------------------------------------------------------------ */
export const VOYAGE_MONTHS = ['NOV 25', 'DEC 25', 'JAN 26', 'FEB 26', 'MAR 26', 'APR 26', 'MAY 26', 'JUN 26', 'JUL 26', 'AUG 26', 'SEP 26', 'OCT 26'];

/** Haversine distance in nautical miles. */
export function distanceNm(lat1, lon1, lat2, lon2) {
  const R = 3440.065;
  const toR = Math.PI / 180;
  const dLat = (lat2 - lat1) * toR;
  const dLon = (lon2 - lon1) * toR;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * toR) * Math.cos(lat2 * toR) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Great-circle interpolation, returns [lat, lon]. */
export function interpolateGreatCircle(a, b, t) {
  const toR = Math.PI / 180;
  const [lat1, lon1] = [a[0] * toR, a[1] * toR];
  const [lat2, lon2] = [b[0] * toR, b[1] * toR];
  const d = 2 * Math.asin(Math.sqrt(Math.sin((lat2 - lat1) / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin((lon2 - lon1) / 2) ** 2));
  if (d < 1e-9) return [a[0], a[1]];
  const A = Math.sin((1 - t) * d) / Math.sin(d);
  const B = Math.sin(t * d) / Math.sin(d);
  const x = A * Math.cos(lat1) * Math.cos(lon1) + B * Math.cos(lat2) * Math.cos(lon2);
  const y = A * Math.cos(lat1) * Math.sin(lon1) + B * Math.cos(lat2) * Math.sin(lon2);
  const z = A * Math.sin(lat1) + B * Math.sin(lat2);
  return [Math.atan2(z, Math.hypot(x, y)) / toR, Math.atan2(y, x) / toR];
}

/** Dense [lat, lon] polyline through the given waypoints. */
export function densifyPath(points, stepNm = 60) {
  const out = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const n = Math.max(2, Math.ceil(distanceNm(a[0], a[1], b[0], b[1]) / stepNm));
    for (let k = 0; k < n; k++) out.push(interpolateGreatCircle(a, b, k / n));
  }
  out.push(points[points.length - 1]);
  return out;
}

function pathLengthNm(points) {
  let d = 0;
  for (let i = 0; i < points.length - 1; i++) d += distanceNm(points[i][0], points[i][1], points[i + 1][0], points[i + 1][1]);
  return d;
}

/* ------------------------------------------------------------------ */
/*  Fleet                                                              */
/* ------------------------------------------------------------------ */
const P = PORTS;

/**
 * Compartment layout per hull type. x0/x1 are fractions of LBP measured from
 * the aft perpendicular (0) to the forward perpendicular (1).
 */
export const HULL_LAYOUTS = {
  container: {
    aftPeak: [0, 0.045], engineRoom: [0.045, 0.165], pumpRoom: null, cargo: [0.17, 0.895], cargoCount: 7, forePeak: [0.905, 1],
    superstructure: [0.12, 0.2], doubleBottomRatio: 0.075, wingRatio: 0.09, cargoLabel: 'Cargo Hold',
    midbody: [0.33, 0.64], bulb: 0.042, flare: 0.22, transom: 0.72, sheer: 0.03, forecastle: 0.06
  },
  vlcc: {
    aftPeak: [0, 0.04], engineRoom: [0.04, 0.15], pumpRoom: [0.15, 0.185], cargo: [0.185, 0.915], cargoCount: 5, forePeak: [0.92, 1],
    superstructure: [0.06, 0.14], doubleBottomRatio: 0.1, wingRatio: 0.06, cargoLabel: 'Cargo Tank',
    midbody: [0.2, 0.8], bulb: 0.035, flare: 0.08, transom: 0.58, sheer: 0.015, forecastle: 0.05
  },
  chemical: {
    aftPeak: [0, 0.045], engineRoom: [0.045, 0.165], pumpRoom: [0.165, 0.195], cargo: [0.195, 0.9], cargoCount: 6, forePeak: [0.905, 1],
    superstructure: [0.07, 0.16], doubleBottomRatio: 0.1, wingRatio: 0.065, cargoLabel: 'Cargo Tank',
    midbody: [0.25, 0.73], bulb: 0.035, flare: 0.1, transom: 0.62, sheer: 0.02, forecastle: 0.05
  },
  bulk: {
    aftPeak: [0, 0.04], engineRoom: [0.04, 0.155], pumpRoom: null, cargo: [0.16, 0.91], cargoCount: 7, forePeak: [0.915, 1],
    superstructure: [0.06, 0.145], doubleBottomRatio: 0.09, wingRatio: 0.0, cargoLabel: 'Cargo Hold',
    midbody: [0.2, 0.82], bulb: 0.035, flare: 0.08, transom: 0.58, sheer: 0.015, forecastle: 0.06
  },
  lng: {
    aftPeak: [0, 0.045], engineRoom: [0.045, 0.17], pumpRoom: null, cargo: [0.18, 0.885], cargoCount: 4, forePeak: [0.89, 1],
    superstructure: [0.07, 0.165], doubleBottomRatio: 0.11, wingRatio: 0.08, cargoLabel: 'Membrane Cargo Tank',
    midbody: [0.27, 0.72], bulb: 0.04, flare: 0.14, transom: 0.66, sheer: 0.02, forecastle: 0.05
  },
  roro: {
    aftPeak: [0, 0.05], engineRoom: [0.05, 0.17], pumpRoom: null, cargo: [0.175, 0.885], cargoCount: 3, forePeak: [0.9, 1],
    superstructure: [0.84, 0.93], doubleBottomRatio: 0.07, wingRatio: 0.03, cargoLabel: 'Vehicle Deck Zone',
    midbody: [0.3, 0.68], bulb: 0.038, flare: 0.06, transom: 0.85, sheer: 0.0, forecastle: 0.0
  }
};

export const FLEET = [
  {
    id: 'KNH-01',
    name: 'KNH-01 // HYPERION NEXUS',
    shortName: 'HYPERION NEXUS',
    typeKey: 'container',
    typeLabel: 'Container Ship (Neo-Panamax ULCV)',
    status: 'LOADING',
    position: { lat: 1.26, lon: 103.82, label: 'Singapore Terminal (Pasir Panjang)' },
    heading: 82,
    speedKn: 0,
    serviceSpeedKn: 21.5,
    identity: { imo: '9861137', mmsi: '419001101', callsign: 'AVHN1', flag: 'India', port: 'Mumbai', builder: 'Cochin Shipyard / HHI design', built: 2022, classSociety: 'IRS / DNV' },
    particulars: { loa: 366.0, lbp: 350.0, beam: 51.0, depth: 29.9, designDraft: 15.5, cb: 0.66, dwt: 145200, gt: 141800, capacity: '14,000 TEU', mainEngine: 'MAN B&W 11S90ME-C10.5 · 62,500 kW', propeller: '1 × FPP 6-blade Ø10.5 m' },
    fault: null,
    voyage: [
      { port: P.SHANGHAI, cargo: 'Mixed FEU / reefer', via: [WP.ECS] },
      { port: P.NINGBO, cargo: 'Electronics, machinery', via: [] },
      { port: P.SINGAPORE, cargo: 'Transhipment', via: [WP.ECS, WP.SCS_N, WP.SCS, WP.SG_STRAIT] },
      { port: P.PORT_SAID, cargo: 'Suez transit', via: [WP.MALACCA_N, WP.DONDRA, WP.ADEN_E, WP.BAB, WP.RED_SEA, WP.SUEZ_S] },
      { port: P.ROTTERDAM, cargo: 'Discharge / load', via: [WP.PORT_SAID_N, WP.CRETE_S, WP.SICILY, WP.ALBORAN, WP.GIBRALTAR, WP.ST_VINCENT, WP.FINISTERRE, WP.USHANT, WP.DOVER] },
      { port: P.HAMBURG, cargo: 'Automotive parts', via: [WP.ELBE] },
      { port: P.ALGECIRAS, cargo: 'Transhipment', via: [WP.ELBE, WP.DOVER, WP.USHANT, WP.FINISTERRE, WP.ST_VINCENT, WP.GIBRALTAR] },
      { port: P.JEDDAH, cargo: 'Consumer goods', via: [WP.ALBORAN, WP.SICILY, WP.CRETE_S, WP.PORT_SAID_N, WP.SUEZ_S, WP.RED_SEA] },
      { port: P.COLOMBO, cargo: 'Transhipment', via: [WP.BAB, WP.ADEN_E, WP.DONDRA] },
      { port: P.SINGAPORE, cargo: 'Reefer / dry FEU', via: [WP.DONDRA, WP.MALACCA_N, WP.SG_STRAIT] },
      { port: P.HONG_KONG, cargo: 'Electronics', via: [WP.SCS, WP.SCS_N] },
      { port: P.SINGAPORE, cargo: 'LOADING — Asia/Europe loop', via: [WP.SCS_N, WP.SCS, WP.SG_STRAIT] }
    ],
    telemetryBase: { aer: 7.42, rating: 'B', eexi: 13.6, eexiRequired: 14.9, foc: 156, tce: 58400, opex: 11800, seed: 101 },
    cargo: {
      summary: 'Containerised general cargo · 11,862 TEU on board',
      weightMt: 138460, stowageFactor: '1.62 m³/t (avg.)', properties: 'IMDG Cl. 3/8/9 segregated · 812 reefer plugs live · VGM verified',
      draft: { fwd: 14.2, mid: 14.6, aft: 15.0 }, gm0: 2.84, trimBy: 'stern', unitLabel: 'Bay', units: 7, unitPrefix: 'Hold'
    }
  },
  {
    id: 'KNH-02',
    name: 'KNH-02 // TITAN VANGUARD',
    shortName: 'TITAN VANGUARD',
    typeKey: 'vlcc',
    typeLabel: 'Oil Tanker (VLCC)',
    status: 'DISCHARGING',
    position: { lat: 51.95, lon: 4.14, label: 'Rotterdam Europort (Maasvlakte Oil Terminal)' },
    heading: 265,
    speedKn: 0,
    serviceSpeedKn: 15.2,
    identity: { imo: '9842218', mmsi: '419001102', callsign: 'AVTV2', flag: 'India', port: 'Mumbai', builder: 'DSME design', built: 2020, classSociety: 'IRS / ABS' },
    particulars: { loa: 333.0, lbp: 320.0, beam: 60.0, depth: 30.5, designDraft: 22.5, cb: 0.83, dwt: 318400, gt: 160900, capacity: '2,000,000 bbl (≈345,000 m³)', mainEngine: 'WinGD 7X82-2.0 · 29,400 kW', propeller: '1 × FPP 4-blade Ø10.2 m' },
    fault: null,
    voyage: [
      { port: P.RAS_TANURA, cargo: 'Arab Light crude', via: [] },
      { port: P.NINGBO, cargo: 'Discharge crude', via: [WP.GULF_INNER, WP.HORMUZ, WP.OMAN, WP.ARABIAN, WP.DONDRA, WP.MALACCA_N, WP.SG_STRAIT, WP.SCS, WP.SCS_N, WP.ECS] },
      { port: P.FUJAIRAH, cargo: 'Bunkers', via: [WP.ECS, WP.SCS_N, WP.SCS, WP.SG_STRAIT, WP.MALACCA_N, WP.DONDRA, WP.ARABIAN, WP.OMAN] },
      { port: P.RAS_TANURA, cargo: 'Arab Medium crude', via: [WP.HORMUZ, WP.GULF_INNER] },
      { port: P.ULSAN, cargo: 'Discharge crude', via: [WP.GULF_INNER, WP.HORMUZ, WP.OMAN, WP.ARABIAN, WP.DONDRA, WP.MALACCA_N, WP.SG_STRAIT, WP.SCS, WP.SCS_N, WP.LUZON, WP.KOREA_STR] },
      { port: P.SINGAPORE, cargo: 'Ballast / bunkers', via: [WP.KOREA_STR, WP.LUZON, WP.SCS_N, WP.SCS, WP.SG_STRAIT] },
      { port: P.RAS_TANURA, cargo: 'Arab Light crude', via: [WP.MALACCA_N, WP.DONDRA, WP.ARABIAN, WP.OMAN, WP.HORMUZ, WP.GULF_INNER] },
      { port: P.CAPE_TOWN, cargo: 'Cape transit (laden)', via: [WP.GULF_INNER, WP.HORMUZ, WP.OMAN, WP.ARABIAN, WP.IO_S, WP.AGULHAS] },
      { port: P.ROTTERDAM, cargo: 'Discharge crude', via: [WP.GOOD_HOPE, WP.GUINEA, WP.BULGE, WP.CANARIES, WP.FINISTERRE, WP.USHANT, WP.DOVER] },
      { port: P.BONNY, cargo: 'Bonny Light crude', via: [WP.DOVER, WP.USHANT, WP.FINISTERRE, WP.CANARIES, WP.BULGE, WP.GUINEA] },
      { port: P.LAS_PALMAS, cargo: 'Bunkers', via: [WP.GUINEA, WP.BULGE, WP.CANARIES] },
      { port: P.ROTTERDAM, cargo: 'DISCHARGING — Bonny Light', via: [WP.CANARIES, WP.FINISTERRE, WP.USHANT, WP.DOVER] }
    ],
    telemetryBase: { aer: 2.05, rating: 'C', eexi: 2.38, eexiRequired: 2.51, foc: 86, tce: 52300, opex: 9800, seed: 202 },
    cargo: {
      summary: 'Bonny Light crude oil · API 35.4 · discharging',
      weightMt: 271350, stowageFactor: '1.18 m³/t', properties: 'API 35.4° · RVP 6.1 psi · H₂S < 5 ppm · Pour point −9 °C · COW in progress',
      draft: { fwd: 20.6, mid: 20.9, aft: 21.3 }, gm0: 6.9, trimBy: 'stern', units: 5, unitPrefix: 'COT'
    }
  },
  {
    id: 'KNH-03',
    name: 'KNH-03 // VALKYRIE ALCHEMIST',
    shortName: 'VALKYRIE ALCHEMIST',
    typeKey: 'chemical',
    typeLabel: 'Chemical Tanker (IMO II, MR)',
    status: 'UNDERWAY',
    position: { lat: 29.92, lon: 32.55, label: 'Suez Approach (Southern Anchorage)' },
    heading: 345,
    speedKn: 9.8,
    serviceSpeedKn: 14.5,
    identity: { imo: '9790345', mmsi: '419001103', callsign: 'AVVA3', flag: 'India', port: 'Mumbai', builder: 'Hyundai Mipo design', built: 2018, classSociety: 'IRS / LR' },
    particulars: { loa: 183.0, lbp: 174.0, beam: 32.2, depth: 19.1, designDraft: 13.3, cb: 0.8, dwt: 49990, gt: 29700, capacity: '53,200 m³ · 18 coated tanks', mainEngine: 'MAN B&W 6G50ME-C9.6 · 8,700 kW', propeller: '1 × FPP 4-blade Ø6.4 m' },
    fault: {
      partId: 'pumproom-pumps',
      label: 'Pump Room · Cargo Pump No.2 — bearing temperature 96 °C, vibration 11.2 mm/s RMS',
      code: 'PRM-CP2-VIB'
    },
    voyage: [
      { port: P.HOUSTON, cargo: 'Methanol / MEG', via: [] },
      { port: P.ROTTERDAM, cargo: 'Discharge methanol', via: [WP.GOM, WP.FLORIDA, WP.BAHAMAS, WP.ATL_N, WP.USHANT, WP.DOVER] },
      { port: P.ANTWERP, cargo: 'Caustic soda', via: [] },
      { port: P.JEBEL_ALI, cargo: 'Discharge / load base oils', via: [WP.DOVER, WP.USHANT, WP.FINISTERRE, WP.ST_VINCENT, WP.GIBRALTAR, WP.ALBORAN, WP.SICILY, WP.CRETE_S, WP.PORT_SAID_N, WP.SUEZ_S, WP.RED_SEA, WP.BAB, WP.ADEN_E, WP.OMAN, WP.HORMUZ] },
      { port: P.MUMBAI, cargo: 'Palm oil / glycols', via: [WP.HORMUZ, WP.OMAN] },
      { port: P.SINGAPORE, cargo: 'Benzene', via: [WP.LACCADIVE, WP.DONDRA, WP.MALACCA_N, WP.SG_STRAIT] },
      { port: P.ULSAN, cargo: 'Styrene monomer', via: [WP.SCS, WP.SCS_N, WP.LUZON, WP.KOREA_STR] },
      { port: P.JEBEL_ALI, cargo: 'Discharge', via: [WP.KOREA_STR, WP.LUZON, WP.SCS_N, WP.SCS, WP.SG_STRAIT, WP.MALACCA_N, WP.DONDRA, WP.ARABIAN, WP.OMAN, WP.HORMUZ] },
      { port: P.KANDLA, cargo: 'Phosphoric acid', via: [WP.HORMUZ, WP.OMAN] },
      { port: P.FUJAIRAH, cargo: 'Bunkers / tank cleaning', via: [WP.OMAN] },
      { port: P.PORT_SAID, cargo: 'Suez northbound', via: [WP.OMAN, WP.ADEN_E, WP.BAB, WP.RED_SEA, WP.SUEZ_S] },
      { port: P.SUEZ_APPROACH, cargo: 'UNDERWAY — awaiting convoy (pump fault)', via: [] }
    ],
    telemetryBase: { aer: 6.28, rating: 'D', eexi: 5.42, eexiRequired: 5.6, foc: 31.5, tce: 24100, opex: 8100, seed: 303 },
    cargo: {
      summary: 'Methanol (IMO II) + MEG + caustic soda · 14 of 18 tanks loaded',
      weightMt: 38520, stowageFactor: '1.26 m³/t', properties: 'Methanol ρ 0.792 t/m³ · flash point 11 °C · N₂ padded · MEG ρ 1.113 · NaOH 50% heated 35 °C',
      draft: { fwd: 11.4, mid: 11.6, aft: 11.9 }, gm0: 2.35, trimBy: 'stern', units: 6, unitPrefix: 'COT'
    }
  },
  {
    id: 'KNH-04',
    name: 'KNH-04 // OBSIDIAN SOVEREIGN',
    shortName: 'OBSIDIAN SOVEREIGN',
    typeKey: 'bulk',
    typeLabel: 'Bulk Carrier (Capesize)',
    status: 'UNDERWAY',
    position: { lat: 12.5, lon: 68.2, label: 'Arabian Sea / Indian Ocean' },
    heading: 32,
    speedKn: 12.8,
    serviceSpeedKn: 14.0,
    identity: { imo: '9814402', mmsi: '419001104', callsign: 'AVOS4', flag: 'India', port: 'Mumbai', builder: 'SWS design', built: 2019, classSociety: 'IRS / BV' },
    particulars: { loa: 299.9, lbp: 295.0, beam: 50.0, depth: 25.0, designDraft: 18.2, cb: 0.85, dwt: 207800, gt: 106500, capacity: '9 holds · 222,500 m³ grain', mainEngine: 'MAN B&W 6G70ME-C9.5 · 16,000 kW', propeller: '1 × FPP 4-blade Ø9.1 m' },
    fault: null,
    voyage: [
      { port: P.PORT_HEDLAND, cargo: 'Iron ore fines', via: [] },
      { port: P.QINGDAO, cargo: 'Discharge iron ore', via: [WP.LOMBOK, WP.MAKASSAR, WP.CELEBES, WP.PHIL_SEA, WP.ECS, WP.YELLOW] },
      { port: P.PORT_HEDLAND, cargo: 'Iron ore lump', via: [WP.YELLOW, WP.ECS, WP.PHIL_SEA, WP.CELEBES, WP.MAKASSAR, WP.LOMBOK] },
      { port: P.QINGDAO, cargo: 'Discharge', via: [WP.LOMBOK, WP.MAKASSAR, WP.CELEBES, WP.PHIL_SEA, WP.ECS, WP.YELLOW] },
      { port: P.TUBARAO, cargo: 'Ballast → iron ore pellets', via: [WP.YELLOW, WP.ECS, WP.LUZON, WP.SCS_N, WP.SCS, WP.KARIMATA, WP.SUNDA, WP.IO_E, WP.IO_S, WP.AGULHAS, WP.GOOD_HOPE, WP.SAT] },
      { port: P.QINGDAO, cargo: 'Discharge pellets', via: [WP.SAT, WP.GOOD_HOPE, WP.AGULHAS, WP.IO_S, WP.IO_E, WP.SUNDA, WP.KARIMATA, WP.SCS, WP.SCS_N, WP.LUZON, WP.ECS, WP.YELLOW] },
      { port: P.PORT_HEDLAND, cargo: 'Iron ore fines', via: [WP.YELLOW, WP.ECS, WP.PHIL_SEA, WP.CELEBES, WP.MAKASSAR, WP.LOMBOK] },
      { port: P.PARADIP, cargo: 'Discharge', via: [WP.LOMBOK, WP.IO_E, WP.BAY_BENGAL] },
      { port: P.RICHARDS_BAY, cargo: 'Steam coal', via: [WP.BAY_BENGAL, WP.DONDRA, WP.IO_S] },
      { port: P.MUNDRA, cargo: 'Discharge coal', via: [WP.IO_S, WP.ARABIAN] },
      { port: P.SALDANHA, cargo: 'Iron ore (Sishen)', via: [WP.ARABIAN, WP.IO_S, WP.AGULHAS, WP.GOOD_HOPE] },
      { port: P.INDIAN_OCEAN, cargo: 'UNDERWAY — laden to Mundra', via: [WP.GOOD_HOPE, WP.AGULHAS, WP.IO_S] }
    ],
    telemetryBase: { aer: 2.31, rating: 'B', eexi: 2.21, eexiRequired: 2.42, foc: 55, tce: 28600, opex: 7400, seed: 404 },
    cargo: {
      summary: 'Iron ore (Sishen lump) · 9 holds · alternate-hold loading',
      weightMt: 196400, stowageFactor: '0.42 m³/t', properties: 'Fe 64.2% · TML 9.8% · MC 6.1% (below TML) · Group C (IMSBC)',
      draft: { fwd: 17.8, mid: 18.0, aft: 18.2 }, gm0: 8.6, trimBy: 'stern', units: 7, unitPrefix: 'Hold'
    }
  },
  {
    id: 'KNH-05',
    name: 'KNH-05 // CRYO HORIZON',
    shortName: 'CRYO HORIZON',
    typeKey: 'lng',
    typeLabel: 'Gas Carrier (LNG Membrane, GTT Mark III Flex)',
    status: 'UNDERWAY',
    position: { lat: 2.8, lon: 101.1, label: 'Malacca Strait' },
    heading: 128,
    speedKn: 17.2,
    serviceSpeedKn: 19.5,
    identity: { imo: '9881520', mmsi: '419001105', callsign: 'AVCH5', flag: 'India', port: 'Mumbai', builder: 'Samsung HI design', built: 2023, classSociety: 'IRS / DNV' },
    particulars: { loa: 295.0, lbp: 284.0, beam: 46.4, depth: 26.5, designDraft: 11.5, cb: 0.75, dwt: 85600, gt: 117400, capacity: '174,000 m³ · 4 membrane tanks', mainEngine: '2 × WinGD 5X72DF-2.1 · 2 × 13,000 kW (dual-fuel)', propeller: '2 × FPP 4-blade Ø8.0 m' },
    fault: null,
    voyage: [
      { port: P.RAS_LAFFAN, cargo: 'LNG loading', via: [] },
      { port: P.FUTTSU, cargo: 'LNG discharge', via: [WP.GULF_INNER, WP.HORMUZ, WP.OMAN, WP.ARABIAN, WP.DONDRA, WP.MALACCA_N, WP.SG_STRAIT, WP.SCS, WP.SCS_N, WP.LUZON, WP.KYUSHU_S, WP.TOKYO_APP] },
      { port: P.RAS_LAFFAN, cargo: 'Ballast (heel retained)', via: [WP.TOKYO_APP, WP.KYUSHU_S, WP.LUZON, WP.SCS_N, WP.SCS, WP.SG_STRAIT, WP.MALACCA_N, WP.DONDRA, WP.ARABIAN, WP.OMAN, WP.HORMUZ, WP.GULF_INNER] },
      { port: P.INCHEON, cargo: 'LNG discharge', via: [WP.GULF_INNER, WP.HORMUZ, WP.OMAN, WP.ARABIAN, WP.DONDRA, WP.MALACCA_N, WP.SG_STRAIT, WP.SCS, WP.SCS_N, WP.LUZON, WP.ECS, WP.YELLOW] },
      { port: P.RAS_LAFFAN, cargo: 'Ballast', via: [WP.YELLOW, WP.ECS, WP.LUZON, WP.SCS_N, WP.SCS, WP.SG_STRAIT, WP.MALACCA_N, WP.DONDRA, WP.ARABIAN, WP.OMAN, WP.HORMUZ, WP.GULF_INNER] },
      { port: P.DAHEJ, cargo: 'LNG discharge', via: [WP.GULF_INNER, WP.HORMUZ, WP.OMAN] },
      { port: P.RAS_LAFFAN, cargo: 'LNG loading', via: [WP.OMAN, WP.HORMUZ, WP.GULF_INNER] },
      { port: P.FUTTSU, cargo: 'LNG discharge', via: [WP.GULF_INNER, WP.HORMUZ, WP.OMAN, WP.ARABIAN, WP.DONDRA, WP.MALACCA_N, WP.SG_STRAIT, WP.SCS, WP.SCS_N, WP.LUZON, WP.KYUSHU_S, WP.TOKYO_APP] },
      { port: P.SINGAPORE, cargo: 'Bunkers / gas-up', via: [WP.TOKYO_APP, WP.KYUSHU_S, WP.LUZON, WP.SCS_N, WP.SCS, WP.SG_STRAIT] },
      { port: P.RAS_LAFFAN, cargo: 'LNG loading', via: [WP.MALACCA_N, WP.DONDRA, WP.ARABIAN, WP.OMAN, WP.HORMUZ, WP.GULF_INNER] },
      { port: P.DAHEJ, cargo: 'LNG discharge', via: [WP.GULF_INNER, WP.HORMUZ, WP.OMAN] },
      { port: P.MALACCA, cargo: 'UNDERWAY — laden to Futtsu', via: [WP.LACCADIVE, WP.DONDRA, WP.MALACCA_N] }
    ],
    telemetryBase: { aer: 9.1, rating: 'A', eexi: 8.6, eexiRequired: 10.2, foc: 118, tce: 72400, opex: 14200, seed: 505 },
    cargo: {
      summary: 'LNG · 165,300 m³ at −161.8 °C · BOR 0.085 %/day',
      weightMt: 74390, stowageFactor: '2.22 m³/t', properties: 'ρ 0.450 t/m³ · CH₄ 91.2% · GCV 39.8 MJ/m³ · tank pressure 112 mbarg · BOG to DF engines',
      draft: { fwd: 11.2, mid: 11.3, aft: 11.4 }, gm0: 4.1, trimBy: 'stern', units: 4, unitPrefix: 'CT'
    }
  },
  {
    id: 'KNH-06',
    name: 'KNH-06 // AETHER VECTOR',
    shortName: 'AETHER VECTOR',
    typeKey: 'roro',
    typeLabel: 'Ro-Ro Carrier (PCTC)',
    status: 'UNDERWAY',
    position: { lat: 50.4, lon: -0.8, label: 'English Channel (TSS westbound)' },
    heading: 252,
    speedKn: 18.4,
    serviceSpeedKn: 19.0,
    identity: { imo: '9875623', mmsi: '419001106', callsign: 'AVAV6', flag: 'India', port: 'Mumbai', builder: 'China Merchants design', built: 2024, classSociety: 'IRS / DNV' },
    particulars: { loa: 199.9, lbp: 192.0, beam: 38.0, depth: 36.0, designDraft: 10.0, cb: 0.6, dwt: 18200, gt: 74500, capacity: '7,000 CEU · 14 decks (4 hoistable)', mainEngine: 'MAN B&W 7S60ME-C10.5-GI (LNG DF) · 15,800 kW', propeller: '1 × CPP 4-blade Ø6.8 m' },
    fault: null,
    voyage: [
      { port: P.YOKOHAMA, cargo: 'Passenger cars', via: [] },
      { port: P.NAGOYA, cargo: 'Cars / high & heavy', via: [] },
      { port: P.SINGAPORE, cargo: 'Transhipment', via: [WP.KYUSHU_S, WP.LUZON, WP.SCS_N, WP.SCS, WP.SG_STRAIT] },
      { port: P.PORT_SAID, cargo: 'Suez transit', via: [WP.MALACCA_N, WP.DONDRA, WP.ADEN_E, WP.BAB, WP.RED_SEA, WP.SUEZ_S] },
      { port: P.ZEEBRUGGE, cargo: 'Discharge vehicles', via: [WP.PORT_SAID_N, WP.CRETE_S, WP.SICILY, WP.ALBORAN, WP.GIBRALTAR, WP.ST_VINCENT, WP.FINISTERRE, WP.USHANT, WP.DOVER] },
      { port: P.SOUTHAMPTON, cargo: 'Load EVs', via: [WP.DOVER] },
      { port: P.BREMERHAVEN, cargo: 'High & heavy', via: [WP.DOVER, WP.ELBE] },
      { port: P.BALTIMORE, cargo: 'Discharge / load', via: [WP.ELBE, WP.DOVER, WP.USHANT, WP.ATL_N, WP.ATL_W, WP.CHESAPEAKE] },
      { port: P.SOUTHAMPTON, cargo: 'Discharge', via: [WP.CHESAPEAKE, WP.ATL_W, WP.ATL_N, WP.USHANT] },
      { port: P.ZEEBRUGGE, cargo: 'Load EVs', via: [WP.DOVER] },
      { port: P.BREMERHAVEN, cargo: 'Load machinery', via: [WP.ELBE] },
      { port: P.ENGLISH_CHANNEL, cargo: 'UNDERWAY — to Baltimore', via: [WP.ELBE, WP.DOVER] }
    ],
    telemetryBase: { aer: 11.8, rating: 'C', eexi: 13.9, eexiRequired: 14.4, foc: 44, tce: 61200, opex: 9200, seed: 606 },
    cargo: {
      summary: 'Ro-Ro vehicles · 5,846 CEU (EV 38%) · high & heavy 1,210 lane-m',
      weightMt: 12180, stowageFactor: '4.6 m³/t', properties: 'EV battery SOC ≤ 30% · lashing per CSM · fire-detect zones 1–9 armed · deck 7 hoisted',
      draft: { fwd: 8.7, mid: 9.0, aft: 9.3 }, gm0: 1.92, trimBy: 'stern', units: 3, unitPrefix: 'Zone'
    }
  }
];

export function getVessel(id) {
  return FLEET.find((v) => v.id === id) ?? null;
}

/* ------------------------------------------------------------------ */
/*  Voyage simulation (12 months, densified great-circle tracks)       */
/* ------------------------------------------------------------------ */
export function getAnnualVoyage(vessel) {
  if (vessel._voyageCache) return vessel._voyageCache;
  const rand = seededRandom(vessel.telemetryBase.seed + 7);
  const legs = [];
  let prev = null;
  vessel.voyage.forEach((call, i) => {
    const portLL = [call.port.lat, call.port.lon];
    let path = [portLL];
    let distance = 0;
    if (prev) {
      path = densifyPath([prev, ...call.via, portLL], 80);
      distance = pathLengthNm([prev, ...call.via, portLL]);
    }
    const seaDays = distance / ((vessel.serviceSpeedKn * 0.92) * 24);
    legs.push({
      index: i,
      month: VOYAGE_MONTHS[i],
      port: call.port,
      cargo: call.cargo,
      path,
      distanceNm: Math.round(distance),
      seaDays: +seaDays.toFixed(1),
      portDays: +(1.2 + rand() * 2.6).toFixed(1)
    });
    prev = portLL;
  });
  vessel._voyageCache = legs;
  return legs;
}

/* ------------------------------------------------------------------ */
/*  Executive telemetry for the Omni-Chronicle reports                  */
/* ------------------------------------------------------------------ */
const RATING_BANDS = ['A', 'B', 'C', 'D', 'E'];
// IMO CII reduction factors (MEPC.338(76) / MEPC.400(83)) vs 2019 reference.
const CII_REDUCTION = { 2025: 0.09, 2026: 0.11 };

export function getTelemetry(vessel) {
  if (vessel._telemetryCache) return vessel._telemetryCache;
  const b = vessel.telemetryBase;
  const rand = seededRandom(b.seed);
  const voyage = getAnnualVoyage(vessel);
  const ratingIndex = RATING_BANDS.indexOf(b.rating);
  const ref = b.aer / ((1 - CII_REDUCTION[2026]) * [0.86, 0.95, 1.0, 1.08, 1.2][ratingIndex]);

  const months = voyage.map((leg, i) => {
    const seasonal = 1 + 0.06 * Math.sin((i / 12) * Math.PI * 2 + b.seed);
    const attained = b.aer * seasonal * (0.95 + rand() * 0.1);
    const year = i < 2 ? 2025 : 2026;
    const required = ref * (1 - CII_REDUCTION[year]);
    // TCE accounting: gross freight = TCE x days + voyage (bunker) costs.
    const bunker = b.foc * leg.seaDays * (560 + rand() * 90) + b.foc * 0.12 * leg.portDays * 640;
    const revenue = b.tce * 30.4 * (0.86 + rand() * 0.26) + bunker;
    const opex = b.opex * 30.4 * (0.94 + rand() * 0.12);
    const profit = revenue - bunker - opex;
    return {
      month: leg.month,
      port: leg.port.name,
      attained: +attained.toFixed(2),
      required: +required.toFixed(2),
      revenue: Math.round(revenue),
      bunker: Math.round(bunker),
      opex: Math.round(opex),
      profit: Math.round(profit),
      distanceNm: leg.distanceNm,
      seaDays: leg.seaDays,
      focMtDay: +(b.foc * (0.9 + rand() * 0.2)).toFixed(1)
    };
  });

  const ytdRevenue = months.reduce((s, m) => s + m.revenue, 0);
  const ytdBunker = months.reduce((s, m) => s + m.bunker, 0);
  const ytdOpex = months.reduce((s, m) => s + m.opex, 0);
  const totalNm = months.reduce((s, m) => s + m.distanceNm, 0);
  const ratingBoundaries = [0.86, 0.94, 1.06, 1.18].map((f) => +(ref * (1 - CII_REDUCTION[2026]) * f).toFixed(2));

  const crew = buildCrewMatrix(vessel, rand);

  vessel._telemetryCache = {
    cii: {
      rating: b.rating,
      ratingIndex,
      aer: b.aer,
      requiredCii: +(ref * (1 - CII_REDUCTION[2026])).toFixed(2),
      ratingBoundaries,
      eexi: b.eexi,
      eexiRequired: b.eexiRequired,
      foc: b.foc,
      co2YtdMt: Math.round(months.reduce((s, m) => s + m.focMtDay * m.seaDays, 0) * 3.114),
      totalNm,
      months
    },
    yield: {
      ytdNetRevenue: ytdRevenue - ytdBunker - ytdOpex,
      ytdGrossRevenue: ytdRevenue,
      tce: b.tce,
      runningOpex: ytdOpex,
      dailyOpex: b.opex,
      bunkerCost: ytdBunker,
      utilisation: +(0.86 + rand() * 0.1).toFixed(3),
      offHireDays: +(rand() * 4).toFixed(1),
      months
    },
    cargo: buildCargoTelemetry(vessel, rand),
    crew
  };
  return vessel._telemetryCache;
}

function buildCargoTelemetry(vessel, rand) {
  const c = vessel.cargo;
  const p = vessel.particulars;
  const units = Array.from({ length: c.units }, (_, i) => {
    const fill = vessel.status === 'DISCHARGING'
      ? 0.3 + rand() * 0.55
      : vessel.status === 'LOADING'
        ? 0.45 + rand() * 0.5
        : 0.82 + rand() * 0.16;
    const tankDepth = p.depth * (1 - HULL_LAYOUTS[vessel.typeKey].doubleBottomRatio);
    return {
      name: `${c.unitPrefix} ${i + 1}`,
      fill: +Math.min(fill, 0.98).toFixed(3),
      ullageM: +(tankDepth * (1 - fill)).toFixed(2),
      soundingM: +(tankDepth * fill).toFixed(2),
      tempC: vessel.typeKey === 'lng' ? -161.8 + rand() * 0.6 : 18 + rand() * 22
    };
  });
  // Shear force / bending moment as % of allowable at 21 stations.
  const sf = [];
  const bm = [];
  for (let i = 0; i <= 20; i++) {
    const x = i / 20;
    const hog = vessel.status === 'DISCHARGING' ? 0.18 : 0;
    bm.push(+(Math.sin(Math.PI * x) * (58 + rand() * 6) * (1 + hog) + (rand() - 0.5) * 3).toFixed(1));
    sf.push(+(Math.sin(2 * Math.PI * x) * (44 + rand() * 6) + (rand() - 0.5) * 4).toFixed(1));
  }
  const trim = +(c.draft.aft - c.draft.fwd).toFixed(2);
  return {
    summary: c.summary,
    weightMt: c.weightMt,
    stowageFactor: c.stowageFactor,
    properties: c.properties,
    draft: c.draft,
    trimM: trim,
    gm0: c.gm0,
    deadweightUtil: +(c.weightMt / p.dwt).toFixed(3),
    units,
    sf,
    bm,
    displacementMt: Math.round(p.lbp * p.beam * c.draft.mid * p.cb * 1.025)
  };
}

const CREW_NAMES = [
  'R. Varadarajan', 'A. Menon', 'S. Kulkarni', 'J. Dsouza', 'V. Iyer', 'P. Fernandes', 'K. Rathore', 'M. Banerjee',
  'T. Nair', 'D. Santos', 'L. Reyes', 'H. Bhat', 'N. Joshi', 'E. Cruz', 'G. Pillai', 'R. Mathew', 'S. Thakur', 'B. Kamat',
  'V. Rao', 'F. Lobo', 'Y. Chauhan', 'I. Gomes'
];
const RANKS = [
  { rank: 'Master', dept: 'DECK', watch: 'DAY', cert: 'II/2 Master (Unlimited)' },
  { rank: 'Chief Officer', dept: 'DECK', watch: '04-08', cert: 'II/2 C/O' },
  { rank: '2nd Officer', dept: 'DECK', watch: '00-04', cert: 'II/1 OOW' },
  { rank: '3rd Officer', dept: 'DECK', watch: '08-12', cert: 'II/1 OOW' },
  { rank: 'Chief Engineer', dept: 'ENGINE', watch: 'DAY', cert: 'III/2 C/E (Unlimited)' },
  { rank: '2nd Engineer', dept: 'ENGINE', watch: '04-08', cert: 'III/2 2/E' },
  { rank: '3rd Engineer', dept: 'ENGINE', watch: '00-04', cert: 'III/1 EOOW' },
  { rank: '4th Engineer', dept: 'ENGINE', watch: '08-12', cert: 'III/1 EOOW' },
  { rank: 'ETO', dept: 'ENGINE', watch: 'DAY', cert: 'III/6 ETO' },
  { rank: 'Bosun', dept: 'DECK', watch: 'DAY', cert: 'II/5 AB Deck' },
  { rank: 'AB (Helm)', dept: 'DECK', watch: '00-04', cert: 'II/5 AB Deck' },
  { rank: 'AB (Helm)', dept: 'DECK', watch: '04-08', cert: 'II/5 AB Deck' },
  { rank: 'AB (Helm)', dept: 'DECK', watch: '08-12', cert: 'II/5 AB Deck' },
  { rank: 'OS', dept: 'DECK', watch: 'DAY', cert: 'II/4 Rating' },
  { rank: 'Pumpman / Fitter', dept: 'ENGINE', watch: 'DAY', cert: 'III/5 AB Engine' },
  { rank: 'Oiler', dept: 'ENGINE', watch: '00-04', cert: 'III/4 Rating' },
  { rank: 'Oiler', dept: 'ENGINE', watch: '04-08', cert: 'III/4 Rating' },
  { rank: 'Wiper', dept: 'ENGINE', watch: '08-12', cert: 'III/4 Rating' },
  { rank: 'Chief Cook', dept: 'CATERING', watch: 'DAY', cert: 'MLC Ship Cook' },
  { rank: 'Messman', dept: 'CATERING', watch: 'DAY', cert: 'VI/1 Basic' },
  { rank: 'Deck Cadet', dept: 'DECK', watch: '08-12', cert: 'Cadet TRB' },
  { rank: 'Engine Cadet', dept: 'ENGINE', watch: '08-12', cert: 'Cadet TRB' }
];

function buildCrewMatrix(vessel, rand) {
  const offset = Number(vessel.id.slice(-1));
  const roster = RANKS.map((r, i) => ({
    ...r,
    name: CREW_NAMES[(i + offset * 3) % CREW_NAMES.length],
    compliance: +(0.88 + rand() * 0.12).toFixed(3),
    restHours7d: +(77 + rand() * 10).toFixed(1),
    contractMonth: 1 + Math.floor(rand() * 6)
  }));
  const depts = ['DECK', 'ENGINE', 'CATERING'].map((d) => {
    const members = roster.filter((r) => r.dept === d);
    return {
      dept: d,
      headcount: members.length,
      readiness: +(members.reduce((s, m) => s + m.compliance, 0) / members.length).toFixed(3)
    };
  });
  const certRings = [
    { label: 'STCW', value: +(0.94 + rand() * 0.06).toFixed(3) },
    { label: 'MEDICAL', value: +(0.9 + rand() * 0.1).toFixed(3) },
    { label: 'GMDSS', value: +(0.92 + rand() * 0.08).toFixed(3) },
    { label: 'ECDIS', value: +(0.95 + rand() * 0.05).toFixed(3) },
    { label: 'BRM/ERM', value: +(0.86 + rand() * 0.14).toFixed(3) },
    { label: vessel.typeKey === 'lng' ? 'IGF/IGC' : vessel.typeKey === 'container' || vessel.typeKey === 'roro' || vessel.typeKey === 'bulk' ? 'SSO' : 'TANKER', value: +(0.9 + rand() * 0.1).toFixed(3) }
  ];
  return { roster, depts, certRings, total: roster.length };
}

/* ------------------------------------------------------------------ */
/*  Tier-1 / Tier-2 structural part tree                               */
/* ------------------------------------------------------------------ */
/*
 * Each member has a `kind` that ForgeShipConstructor maps to a geometry
 * builder. Sectors flagged `enterable` define an interior vantage point used by
 * the Mode C fly-in camera.
 */
const DESC = {
  sideShell: 'Longitudinally framed side shell plating forming the outer watertight envelope; resists hydrostatic pressure, racking and longitudinal bending as part of the hull girder flange-web system.',
  bottomShell: 'Flat bottom plating including the keel strake; the lowest flange of the hull girder, subjected to maximum sagging compression and slamming loads forward.',
  bowShell: 'Flared bow plating between the stem and the collision bulkhead, heavily stiffened against bow-flare slamming and green-water impact.',
  sternShell: 'Aft shell and transom plating enclosing the steering gear flat and aft peak; reinforced around the stern tube boss and rudder trunk.',
  sheerStrake: 'Uppermost strake of side shell joining the stringer plate of the strength deck; a critical high-stress hull girder flange member with rounded/radiused gunwale.',
  bilgeKeel: 'Longitudinal fin fitted at the turn of bilge over the parallel midbody to damp rolling; attached via a ground bar so a fracture cannot propagate into the shell.',
  weatherDeck: 'Strength (freeboard) deck plating — the upper flange of the hull girder — carrying deck cargo, hatch openings and green-sea loads.',
  deckBeams: 'Transverse deck beams and deck transverses supporting the deck plating and longitudinals, bracketed to side frames to form transverse rings.',
  deckLongitudinals: 'Continuous deck longitudinal stiffeners running fore-and-aft under the strength deck, carrying hull-girder bending stress and preventing deck plate buckling.',
  transFrames: 'Transverse web frames / web rings at regular spacing, supporting longitudinals and maintaining the transverse shape of the compartment against sea and cargo pressure.',
  longFrames: 'Side and bottom longitudinal frames (stiffeners) spanning between web frames; attached to the shell with end brackets and tripping brackets.',
  tankSupports: 'Seating chocks and tank supports transferring concentrated loads (tanks, machinery) into the double-bottom girders; fitted with resin or steel chocks.',
  centerGirder: 'Continuous watertight centre girder (CVK) running the length of the double bottom; principal longitudinal strength member and docking-block landing.',
  sideGirders: 'Non-watertight side girders in the double bottom with lightening holes, supporting floors and the inner bottom.',
  floors: 'Plate floors at every web frame spacing in the double bottom, transmitting bottom pressure to the girders; with lightening and drain holes.',
  marginPlate: 'Margin plate forming the boundary between the inner bottom (tank top) and the side shell / hopper, sealing the double-bottom tanks at the turn of bilge.',
  tankTop: 'Inner bottom (tank top) plating forming the second watertight barrier; designed for cargo and grab-impact loads in holds.',
  collisionBhd: 'Watertight collision bulkhead located 0.05–0.08 L aft of the forward perpendicular (SOLAS II-1/12); the first line of defence against bow damage.',
  pantingStringers: 'Horizontal panting stringers in the forepeak, spaced ~2 m apart vertically, stiffening the bow shell against in-and-out panting pressure fluctuations.',
  pantingBeams: 'Panting beams tying port and starboard stringers together across the forepeak, preventing the bow from "breathing" in a seaway.',
  forepeakFrames: 'Closely spaced transverse frames in the forepeak with deep floors, supporting the bow plating forward of the collision bulkhead.',
  bulbousBow: 'Bulbous bow forefoot reducing wave-making resistance at service speed; internally stiffened with a vertical diaphragm and ring frames.',
  chainLocker: 'Chain locker and spurling pipes below the windlass, stowing the anchor cables with a bitter-end release outside the locker.',
  windlass: 'Hydraulic anchor windlass and mooring winches on the forecastle with chain stoppers and hawse pipes.',
  aftPeakBhd: 'Aft peak bulkhead enclosing the stern tube in a watertight compartment (SOLAS II-1/12.10).',
  sternFrame: 'Cast/fabricated stern frame with rudder horn and propeller boss, transferring rudder and propeller loads into the hull.',
  propeller: 'Fixed-pitch nickel-aluminium-bronze propeller on the intermediate/tail shaft, absorbing main-engine power at service RPM.',
  rudder: 'Semi-balanced / spade rudder with twisted leading edge, actuated by an electro-hydraulic rotary-vane steering gear (SOLAS 35°–30° in 28 s).',
  accommodation: 'Accommodation block: cabins, mess rooms, ship\'s office, hospital and lifesaving muster stations, insulated A-60 from machinery spaces.',
  wheelhouse: 'Integrated navigation bridge: ECDIS, X/S-band ARPA radars, conning display, autopilot/track control, GMDSS console and engine telegraph.',
  bridgeWings: 'Open bridge wings with repeater compasses and wing consoles for berthing and pilot boarding, extending to the full beam.',
  funnel: 'Funnel casing enclosing main-engine and auxiliary exhaust uptakes, economiser and silencers, with ECA-compliant scrubber/SCR housings.',
  radarMast: 'Radar and signal mast carrying X/S-band scanners, navigation lights, VHF/GNSS/VSAT antennas and the whistle.',
  lifeboats: 'Totally enclosed lifeboats on gravity davits plus liferaft stations (SOLAS III), each for 100% complement per side.',
  erBoundary: 'Engine room boundary: machinery-space bulkheads, flats and the casing, A-60 insulated with fixed CO₂/high-expansion foam protection.',
  mainEngine: 'Two-stroke slow-speed crosshead main engine with electronic fuel injection and exhaust valve actuation, directly coupled to the shaft line.',
  generators: 'Diesel generator sets supplying the 6.6 kV / 440 V switchboard; auto-start and load sharing via the power management system.',
  shaftLine: 'Intermediate and tail shaft with plummer bearings and an oil-lubricated stern tube with lip-type seals.',
  pumpRoomBoundary: 'Cargo pump room — a gas-dangerous space between the engine room and cargo tanks with forced ventilation, gas detection and bilge alarms.',
  cargoPumps: 'Steam-turbine/electric-driven centrifugal cargo pumps with suction from the cargo main, discharge to the midship manifold, and casing temperature/vibration monitoring.',
  strippingPump: 'Reciprocating / eductor stripping system clearing tank bottoms below centrifugal pump suction head.',
  cellGuides: 'Vertical cell guides (angle-bar rails) inside container holds locating each stack of containers without lashing below deck.',
  hatchCoamings: 'Longitudinal and transverse hatch coamings supporting the pontoon hatch covers, contributing to deck strength and weathertightness.',
  lashingBridges: 'Lashing bridges between hatch covers giving access to lash on-deck tiers 3–5 with turnbuckles and lashing rods.',
  torsionBox: 'Torsion box girders at the top of the wing tanks: thick-plate box sections providing torsional rigidity to the open-deck hull.',
  containerStack: 'On-deck and in-hold container stacks (ISO 40\' FEU / 20\' TEU) with twistlocks and lashing rods; weight and stack load verified by the loading computer.',
  swashBhd: 'Non-tight swash bulkhead inside a long cargo tank reducing free-surface sloshing loads.',
  corrugatedBhd: 'Vertically corrugated transverse bulkhead — the corrugations provide stiffness without separate stiffeners, easing tank cleaning.',
  deckLongStiff: 'Deck longitudinal stiffeners on tanker main deck (stiffeners outside tanks on chemical tankers for cleanability).',
  heatingCoils: 'Stainless/aluminium-brass heating coils on the tank bottom, steam or thermal-oil fed, to keep high-viscosity cargoes pumpable.',
  deepwellPump: 'Submerged deepwell hydraulic cargo pump (one per tank) with cofferdam purging and integral stripping.',
  suctionBell: 'Cargo pump suction bell-mouth in the aft tank well with sump, connected to the cargo main line.',
  topsideTank: 'Topside wing ballast tank in the upper corner of the hold; sloping plating self-trims bulk cargo and contributes to torsional strength.',
  hopperTank: 'Lower hopper wing tank with sloped plating that channels cargo toward the hold centre for grab discharge.',
  stools: 'Upper and lower bulkhead stools supporting the corrugated transverse bulkheads between holds.',
  doubleSkin: 'Double-skin side shell (inner side plating) protecting the outer shell from cargo-handling damage and providing ballast space.',
  primaryMembrane: 'Primary barrier: 1.2 mm corrugated stainless steel (Mark III) / 0.7 mm Invar (NO96) membrane in direct contact with LNG at −163 °C.',
  secondaryMembrane: 'Secondary barrier (Triplex composite / Invar) able to contain leaked LNG for 15 days (IGC Code 4.4).',
  insulation: 'Reinforced polyurethane foam panels / perlite-filled plywood boxes forming the cryogenic insulation space between barriers and inner hull.',
  cryoSupports: 'Cryogenic tank supports, anti-roll keys and anti-flotation chocks resisting tank movement in heavy weather (IGC 4.6).',
  domes: 'Liquid dome and vapour dome carrying cargo pumps\' discharge, spray, filling and vapour lines to the deck manifold.',
  reliquefaction: 'Boil-off gas reliquefaction / gas combustion unit: compresses BOG, recondenses it and returns LNG to the tanks.',
  quarterRamp: 'Stern quarter ramp (≈ 35 m, 300 t SWL) hinged at the transom, used for drive-on/drive-off with articulated flaps.',
  carDecks: 'Hydraulically hoistable car decks that can be raised/lowered to accommodate high & heavy cargo heights.',
  rackingFrames: 'Heavy racking transverse web frames resisting racking distortion in the open ro-ro deck spaces without transverse bulkheads.',
  shellDoors: 'Side shell doors / side ramp with hydraulic cleating and watertight seals for quayside loading.',
  compartment: 'Compartment boundary — watertight bulkheads, inner hull and tank top enclosing the space. Fly the gauntlet camera inside to inspect its framing from the inside out.'
};

export function getPartTree(vessel) {
  const t = vessel.typeKey;
  const L = HULL_LAYOUTS[t];
  const sectors = [];

  sectors.push({
    id: 'hull',
    name: 'Hull Envelope & Strength Deck',
    kind: 'hull',
    members: [
      { id: 'hull-side-port', name: 'Side Shell Plating — Port', kind: 'sideShellPort', desc: DESC.sideShell, shell: true, explode: [0, 0, -1] },
      { id: 'hull-side-stbd', name: 'Side Shell Plating — Starboard', kind: 'sideShellStbd', desc: DESC.sideShell, shell: true, explode: [0, 0, 1] },
      { id: 'hull-bottom', name: 'Bottom Shell & Keel Strake', kind: 'bottomShell', desc: DESC.bottomShell, shell: true, explode: [0, -1, 0] },
      { id: 'hull-bow', name: 'Bow Flare Shell Plating', kind: 'bowShell', desc: DESC.bowShell, shell: true, explode: [1, 0, 0] },
      { id: 'hull-stern', name: 'Stern & Transom Shell', kind: 'sternShell', desc: DESC.sternShell, shell: true, explode: [-1, 0, 0] },
      { id: 'hull-sheer-port', name: 'Sheer Strake — Port', kind: 'sheerPort', desc: DESC.sheerStrake, shell: true, explode: [0, 0.3, -1] },
      { id: 'hull-sheer-stbd', name: 'Sheer Strake — Starboard', kind: 'sheerStbd', desc: DESC.sheerStrake, shell: true, explode: [0, 0.3, 1] },
      { id: 'hull-bilge-keels', name: 'Bilge Keels (P & S)', kind: 'bilgeKeels', desc: DESC.bilgeKeel, shell: true, explode: [0, -1, 0] },
      { id: 'hull-deck', name: 'Strength Deck Plating', kind: 'weatherDeck', desc: DESC.weatherDeck, shell: true, explode: [0, 1, 0] },
      { id: 'hull-deck-beams', name: 'Deck Beams & Deck Transverses', kind: 'deckBeams', desc: DESC.deckBeams, explode: [0, 1, 0] },
      { id: 'hull-deck-longis', name: 'Deck Longitudinals', kind: 'deckLongitudinals', desc: DESC.deckLongitudinals, explode: [0, 1, 0] },
      ...(t === 'container' ? [{ id: 'hull-torsion-box', name: 'Torsion Box Girders (P & S)', kind: 'torsionBox', desc: DESC.torsionBox, explode: [0, 0.6, 0] }] : []),
      ...(t === 'roro' ? [{ id: 'hull-shell-doors', name: 'Side Shell Doors / Side Ramp', kind: 'shellDoors', desc: DESC.shellDoors, shell: true, explode: [0, 0, 1] }] : [])
    ]
  });

  const [c0, c1] = L.cargo;
  const n = L.cargoCount;
  for (let i = 0; i < n; i++) {
    // No.1 is forward-most (shipboard convention).
    const idx = n - i;
    const x1 = c1 - (i * (c1 - c0)) / n;
    const x0 = c1 - ((i + 1) * (c1 - c0)) / n;
    const label = `No.${idx} ${L.cargoLabel}`;
    const sid = `cargo-${idx}`;
    const m = [
      { id: `${sid}-boundary`, name: `${label} — Boundary`, kind: 'compartment', desc: DESC.compartment, compartment: true },
      { id: `${sid}-webs`, name: 'Transverse Web Frames / Web Rings', kind: 'transFrames', desc: DESC.transFrames },
      { id: `${sid}-longis`, name: 'Longitudinal Frames (Side & Bottom)', kind: 'longFrames', desc: DESC.longFrames }
    ];
    if (t === 'container') {
      m.push(
        { id: `${sid}-cellguides`, name: 'Cell Guides', kind: 'cellGuides', desc: DESC.cellGuides },
        { id: `${sid}-coaming`, name: 'Hatch Coamings', kind: 'hatchCoamings', desc: DESC.hatchCoamings, explode: [0, 1, 0] },
        { id: `${sid}-lashing`, name: 'Lashing Bridge', kind: 'lashingBridges', desc: DESC.lashingBridges, explode: [0, 1, 0] },
        { id: `${sid}-stack`, name: `Container Stack — Bay Group ${idx}`, kind: 'containerStack', desc: DESC.containerStack, explode: [0, 1.4, 0] }
      );
    } else if (t === 'vlcc' || t === 'chemical') {
      m.push(
        { id: `${sid}-corrugated`, name: 'Corrugated Transverse Bulkhead', kind: 'corrugatedBhd', desc: DESC.corrugatedBhd },
        { id: `${sid}-swash`, name: 'Swash Bulkhead', kind: 'swashBhd', desc: DESC.swashBhd },
        { id: `${sid}-deckstiff`, name: 'Deck Longitudinal Stiffeners', kind: 'deckLongStiff', desc: DESC.deckLongStiff, explode: [0, 1, 0] },
        { id: `${sid}-heating`, name: 'Cargo Heating Coils', kind: 'heatingCoils', desc: DESC.heatingCoils },
        { id: `${sid}-supports`, name: 'Tank Supports & Chocks', kind: 'tankSupports', desc: DESC.tankSupports },
        t === 'chemical'
          ? { id: `${sid}-deepwell`, name: 'Deepwell Cargo Pump', kind: 'deepwellPump', desc: DESC.deepwellPump }
          : { id: `${sid}-suction`, name: 'Pump Suction Bell & Sump', kind: 'suctionBell', desc: DESC.suctionBell }
      );
    } else if (t === 'bulk') {
      m.push(
        { id: `${sid}-topside`, name: 'Topside Wing Tanks (P & S)', kind: 'topsideTank', desc: DESC.topsideTank },
        { id: `${sid}-hopper`, name: 'Lower Hopper Tanks (P & S)', kind: 'hopperTank', desc: DESC.hopperTank },
        { id: `${sid}-stools`, name: 'Upper & Lower Stool Structures', kind: 'stools', desc: DESC.stools },
        { id: `${sid}-doubleskin`, name: 'Double-Skin Side Shell', kind: 'doubleSkin', desc: DESC.doubleSkin },
        { id: `${sid}-coaming`, name: 'Hatch Coaming & Cover', kind: 'hatchCoamings', desc: DESC.hatchCoamings, explode: [0, 1, 0] }
      );
    } else if (t === 'lng') {
      m.push(
        { id: `${sid}-primary`, name: 'Primary Membrane (Stainless/Invar)', kind: 'primaryMembrane', desc: DESC.primaryMembrane },
        { id: `${sid}-secondary`, name: 'Secondary Barrier Membrane', kind: 'secondaryMembrane', desc: DESC.secondaryMembrane },
        { id: `${sid}-insulation`, name: 'Insulation Boxes (PUF / Perlite)', kind: 'insulation', desc: DESC.insulation },
        { id: `${sid}-supports`, name: 'Cryogenic Supports & Anti-Roll Keys', kind: 'cryoSupports', desc: DESC.cryoSupports },
        { id: `${sid}-dome`, name: 'Liquid & Vapour Dome Manifold', kind: 'domes', desc: DESC.domes, explode: [0, 1, 0] }
      );
    } else if (t === 'roro') {
      m.push(
        { id: `${sid}-cardecks`, name: 'Internal Hoistable Car Decks', kind: 'carDecks', desc: DESC.carDecks },
        { id: `${sid}-racking`, name: 'Racking Transverse Web Frames', kind: 'rackingFrames', desc: DESC.rackingFrames }
      );
    }
    sectors.push({ id: sid, name: label, kind: 'cargo', range: [x0, x1], index: idx, enterable: true, members: m });
  }

  sectors.push({
    id: 'superstructure',
    name: 'Navigation Bridge & Superstructure',
    kind: 'superstructure',
    members: [
      { id: 'sup-accommodation', name: 'Accommodation Deckhouse', kind: 'accommodation', desc: DESC.accommodation, explode: [0, 1, 0] },
      { id: 'sup-wheelhouse', name: 'Wheelhouse / Navigation Bridge', kind: 'wheelhouse', desc: DESC.wheelhouse, explode: [0, 1.4, 0] },
      { id: 'sup-wings', name: 'Bridge Wings', kind: 'bridgeWings', desc: DESC.bridgeWings, explode: [0, 1.4, 0] },
      { id: 'sup-funnel', name: 'Funnel & Exhaust Uptakes', kind: 'funnel', desc: DESC.funnel, explode: [0, 1.2, 0] },
      { id: 'sup-mast', name: 'Radar & Signal Mast', kind: 'radarMast', desc: DESC.radarMast, explode: [0, 1.6, 0] },
      { id: 'sup-lifeboats', name: 'Lifeboats & Davits', kind: 'lifeboats', desc: DESC.lifeboats, explode: [0, 0.6, 1] },
      ...(t === 'lng' ? [{ id: 'sup-reliq', name: 'BOG Reliquefaction Unit', kind: 'reliquefaction', desc: DESC.reliquefaction, explode: [0, 1, 0] }] : [])
    ]
  });

  sectors.push({
    id: 'engine',
    name: 'Engine Room',
    kind: 'engine',
    range: L.engineRoom,
    enterable: true,
    members: [
      { id: 'er-boundary', name: 'Engine Room — Boundary', kind: 'compartment', desc: DESC.erBoundary, compartment: true },
      { id: 'er-main-engine', name: 'Main Engine', kind: 'mainEngine', desc: DESC.mainEngine },
      { id: 'er-generators', name: 'Diesel Generator Sets', kind: 'generators', desc: DESC.generators },
      { id: 'er-shaft', name: 'Shaft Line & Stern Tube', kind: 'shaftLine', desc: DESC.shaftLine },
      { id: 'er-chocks', name: 'Engine Seating — Tank Supports & Chocks', kind: 'tankSupports', desc: DESC.tankSupports },
      { id: 'er-webs', name: 'Engine Room Web Frames', kind: 'transFrames', desc: DESC.transFrames }
    ]
  });

  if (L.pumpRoom) {
    sectors.push({
      id: 'pumproom',
      name: 'Cargo Pump Room',
      kind: 'pumproom',
      range: L.pumpRoom,
      enterable: true,
      members: [
        { id: 'pumproom-boundary', name: 'Pump Room — Boundary', kind: 'compartment', desc: DESC.pumpRoomBoundary, compartment: true },
        { id: 'pumproom-pumps', name: 'Centrifugal Cargo Pumps No.1–3', kind: 'cargoPumps', desc: DESC.cargoPumps },
        { id: 'pumproom-stripping', name: 'Stripping Pump & Eductors', kind: 'strippingPump', desc: DESC.strippingPump },
        { id: 'pumproom-webs', name: 'Pump Room Web Frames', kind: 'transFrames', desc: DESC.transFrames }
      ]
    });
  }

  sectors.push({
    id: 'forepeak',
    name: 'Forepeak & Bow Structure',
    kind: 'forepeak',
    range: L.forePeak,
    enterable: true,
    members: [
      { id: 'fp-boundary', name: 'Forepeak Tank — Boundary', kind: 'compartment', desc: DESC.compartment, compartment: true },
      { id: 'fp-collision', name: 'Collision Bulkhead', kind: 'collisionBhd', desc: DESC.collisionBhd },
      { id: 'fp-stringers', name: 'Panting Stringers', kind: 'pantingStringers', desc: DESC.pantingStringers },
      { id: 'fp-beams', name: 'Panting Beams', kind: 'pantingBeams', desc: DESC.pantingBeams },
      { id: 'fp-frames', name: 'Forepeak Transverse Frames & Deep Floors', kind: 'forepeakFrames', desc: DESC.forepeakFrames },
      { id: 'fp-bulb', name: 'Bulbous Bow', kind: 'bulbousBow', desc: DESC.bulbousBow, explode: [1, -0.3, 0] },
      { id: 'fp-chain', name: 'Chain Locker & Spurling Pipes', kind: 'chainLocker', desc: DESC.chainLocker },
      { id: 'fp-windlass', name: 'Windlass & Mooring Winches', kind: 'windlass', desc: DESC.windlass, explode: [0.4, 1, 0] }
    ]
  });

  sectors.push({
    id: 'aftpeak',
    name: 'Aftpeak & Steering',
    kind: 'aftpeak',
    range: L.aftPeak,
    enterable: true,
    members: [
      { id: 'ap-boundary', name: 'Aftpeak Tank — Boundary', kind: 'compartment', desc: DESC.compartment, compartment: true },
      { id: 'ap-bulkhead', name: 'Aft Peak Bulkhead', kind: 'aftPeakBhd', desc: DESC.aftPeakBhd },
      { id: 'ap-sternframe', name: 'Stern Frame & Rudder Horn', kind: 'sternFrame', desc: DESC.sternFrame },
      { id: 'ap-propeller', name: 'Propeller', kind: 'propeller', desc: DESC.propeller, explode: [-1, -0.2, 0] },
      { id: 'ap-rudder', name: 'Rudder & Steering Gear', kind: 'rudder', desc: DESC.rudder, explode: [-1, -0.4, 0] },
      ...(t === 'roro' ? [{ id: 'ap-quarter-ramp', name: 'Stern Quarter Ramp', kind: 'quarterRamp', desc: DESC.quarterRamp, explode: [-1, 0.2, 0.6] }] : [])
    ]
  });

  const outfit = [
    { id: 'out-railings', name: 'Guard Rails & Stanchions', kind: 'railings', desc: 'Deck guard rails (1 m min.) on stanchions along the deck edge and accommodation decks, per ICLL Reg. 25.', explode: [0, 0.5, 0] },
    { id: 'out-mooring', name: 'Aft Mooring Winches & Bollards', kind: 'mooring', desc: 'Aft mooring deck: split-drum mooring winches, double bollards and Panama chocks; MBL-rated lines per OCIMF MEG4.', explode: [-0.4, 1, 0] }
  ];
  if (t === 'vlcc' || t === 'chemical') {
    outfit.push(
      { id: 'out-piping', name: 'Cargo Manifold & Deck Piping', kind: 'deckPiping', desc: 'Cargo mains, vapour return and crossover manifold at midships (OCIMF manifold recommendations), on pipe supports with catwalk above.', explode: [0, 1.2, 0] },
      { id: 'out-hosecranes', name: 'Hose Handling Cranes', kind: 'hoseCranes', desc: 'Electro-hydraulic hose-handling cranes (15 t SWL) serving the port and starboard manifolds.', explode: [0, 1.4, 0] }
    );
  } else if (t === 'bulk') {
    outfit.push({ id: 'out-cranes', name: 'Deck Cranes (4 × 30 t)', kind: 'deckCranes', desc: 'Pedestal-mounted electro-hydraulic deck cranes between hatches; Capesize vessels are normally gearless — fitted here for stores and hatch-cover handling.', explode: [0, 1.4, 0] });
  } else if (t === 'lng') {
    outfit.push({ id: 'out-trunk', name: 'Trunk Deck & Cargo Piping', kind: 'trunkDeck', desc: 'Raised trunk deck over the membrane tanks carrying the liquid, vapour, spray and gas-fuel lines between domes and the midship manifold.', explode: [0, 1.2, 0] });
  }
  sectors.push({ id: 'outfit', name: 'Deck Outfitting & Cargo Gear', kind: 'outfit', members: outfit });

  sectors.push({
    id: 'doublebottom',
    name: 'Double Bottom',
    kind: 'doublebottom',
    range: [L.engineRoom[1], L.forePeak[0]],
    enterable: true,
    members: [
      { id: 'db-boundary', name: 'Double Bottom Tanks — Boundary', kind: 'compartment', desc: DESC.compartment, compartment: true },
      { id: 'db-center-girder', name: 'Centre Girder (CVK)', kind: 'centerGirder', desc: DESC.centerGirder },
      { id: 'db-side-girders', name: 'Side Girders', kind: 'sideGirders', desc: DESC.sideGirders },
      { id: 'db-floors', name: 'Plate Floors', kind: 'floors', desc: DESC.floors },
      { id: 'db-margin', name: 'Margin Plate', kind: 'marginPlate', desc: DESC.marginPlate },
      { id: 'db-tanktop', name: 'Inner Bottom (Tank Top) Plating', kind: 'tankTop', desc: DESC.tankTop, explode: [0, 0.6, 0] }
    ]
  });

  return sectors;
}

/** Quick-jump interior buttons for Mode C. */
export function getInteriorJumps(vessel) {
  const tree = getPartTree(vessel);
  return tree
    .filter((s) => s.enterable)
    .map((s) => ({ sectorId: s.id, label: `Enter ${s.kind === 'forepeak' ? 'Forepeak Internal Framing' : s.name}${s.kind === 'cargo' || s.kind === 'engine' ? ' Interior' : ''}` }));
}

/** Third-party AIS traffic seeds around each owned vessel (Mode A). */
export const AIS_TARGET_TYPES = ['Container Ship', 'Bulk Carrier', 'Crude Tanker', 'Product Tanker', 'General Cargo', 'Fishing Vessel', 'Tug', 'Passenger Ferry', 'LPG Carrier', 'Offshore Supply'];
export const AIS_TARGET_NAMES = ['MAERA STAR', 'OCEAN PIONEER', 'SEA LOTUS', 'NORDIC TERN', 'GOLDEN WAVE', 'PACIFIC DAWN', 'BLUE MARLIN', 'CORAL QUEEN', 'IRON DUKE', 'STELLA MARIS', 'EVER BRIGHT', 'KAIROS', 'ATLAS VOYAGER', 'SILVER HORIZON', 'MISTRAL', 'ORION SPIRIT', 'PEARL OF ADEN', 'CAPE FALCON', 'JADE PHOENIX', 'POLAR KESTREL'];
