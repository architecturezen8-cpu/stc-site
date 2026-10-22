const px = (id: string, w = 800, h = 1200) =>
  `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=${h}&w=${w}`;

/** Portrait headshots (800x1200) */
export const PORTRAIT = {
  man1: px("38889923"),
  man2: px("11732718"),
  man3: px("10816007"),
  man4: px("7695660"),
  man5: px("19201354"),
  man6: px("28446973"),
  man7: px("12989198"),
  man8: px("38889910"),
  man9: px("26872232"),
  man10: px("38889922"),
  woman1: px("38197025"),
  woman2: px("5212317"),
  boy1: px("13538613"),
  boy2: px("33782593"),
  boy3: px("32037742"),
  boy4: px("38245944"),
  boy5: px("30649814"),
};

/** Landscape scene imagery (1200x627) */
export const SCENE = {
  hockey: px("29658108", 1200, 627),
  volleyball: px("25824200", 1200, 627),
  tennis: px("32289808", 1200, 627),
  cadetFormation: px("37789888", 1200, 627),
  cadetParade: px("19699564", 1200, 627),
  westernBand: px("33103276", 1200, 627),
  militaryBand: px("20117270", 1200, 627),
  scouts: px("9290026", 1200, 627),
  orchestra: px("7095737", 1200, 627),
  colonnade: px("27238158", 1200, 627),
};
