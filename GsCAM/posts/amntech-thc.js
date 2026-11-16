export const AMNTECH_THC = {
  id: 'amntech-thc',
  name: 'AMN Tech THC',
  ext: '.tap',
  units: 'metric',
  decimalPlaces: 4,
  lineNumberStart: 10,
  lineNumberStep: 1,

  header: (ctx) => [
    `(${ctx.fileName})`,
    `(${ctx.postName})`,
    `(${ctx.date})`,
    ctx.units === 'metric' ? 'G21 (Units: Metric)' : 'G20 (Units: Inch)',
    'G53 G90 G91.1 G40',
    'M902',
    'M901',
  ],

  torchOn: ['M03'],
  torchOff: ['M05', 'M902', 'M901'],

  footer: ['M05 M30'],

  modalGcode: true,
  modalCoords: true,

  useTHC: true,
  pierceDelay: 0,

  arcMode: 'ij',
  arcPlane: 'G17',

  defaults: {
    cutFeed: 1500,
    pierceHeight: 3.8,
    cutHeight: 1.5,
    leadInLength: 4,
    applyKerf: true,
  },

  perThickness: {
    3: { cutFeed: 1800 },
    4: { cutFeed: 1600 },
    6: { cutFeed: 1200 },
    8: { cutFeed: 900 },
  },

  // НОВЫЙ МЕТОД: Определяет скорость подачи (F) в зависимости от толщины
  getCutFeed: (thickness) => {
    const t = parseFloat(thickness);
    if (AMNTECH_THC.perThickness[t] && AMNTECH_THC.perThickness[t].cutFeed) {
      return AMNTECH_THC.perThickness[t].cutFeed;
    }
    return AMNTECH_THC.defaults.cutFeed;
  }
};