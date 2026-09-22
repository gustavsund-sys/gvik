// Course registry. Each course keeps its own Firestore document and imagery.
window.GVIK_COURSES = [
  { id: 'gustavsvik', name: 'Gustavsviksbanan', holes: 18, imagery: 'orthophoto', terrain: 'local-terrain', ready: true },
  { id: 'mosjobanan', name: 'Mosjöbanan', holes: 18, imagery: 'orthophoto/mosjobanan', terrain: 'local-terrain', terrainPath: 'terrain-mosjo', ready: true },
  { id: 'pay-and-play', name: 'Pay & Play', holes: 18, imagery: 'orthophoto', terrain: 'local-terrain', ready: true }
];
window.GVIK_DEFAULT_COURSE = 'gustavsvik';
