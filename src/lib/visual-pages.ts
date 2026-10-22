export type VisualEditorPage = {
  title: string;
  path: string;
  group: string;
  description: string;
  /** Page uses the section inspector (EditableSection + LiveSiteEditor) —
   *  /admin opens it with ?cmsEditor=1&edit=1 so section lists (A/L teachers,
   *  classes, Old Thomians) and their "Add" buttons are reachable. */
  sectionEditor?: boolean;
};

export const VISUAL_EDITOR_PAGES: VisualEditorPage[] = [
  { title: "Home Page", path: "/", group: "Main", description: "Hero, principal, about, news and academic pathways", sectionEditor: true },
  { title: "Admissions", path: "/admissions", group: "Main", description: "Admissions hero, process, requirements and application introduction" },
  { title: "Contact", path: "/contact", group: "Main", description: "Contact information, directions and department directory" },
  { title: "Our History", path: "/history", group: "About", description: "History hero, timeline, alumni and legacy content", sectionEditor: true },
  { title: "Vision & Mission", path: "/vision-mission", group: "About", description: "Vision, mission, colours, houses, song and values" },
  { title: "Principal's Message", path: "/principals-message", group: "About", description: "Principal's welcome, message and college priorities" },
  { title: "Our Staff", path: "/staff", group: "About", description: "Staff hero, leadership and faculty section copy" },
  { title: "Ordinary Level", path: "/ordinary-level", group: "Academics", description: "O/L programme, subjects, baskets and resources" },
  { title: "O/L Past Papers", path: "/ordinary-level/past-papers", group: "Academics", description: "Online resources and past-paper library introduction" },
  { title: "Advanced Level", path: "/advanced-level", group: "Academics", description: "A/L streams, learning method, facilities and CTA" },
  { title: "Biological Science", path: "/advanced-level/biological-science", group: "A/L Streams", description: "Biological Science full stream page", sectionEditor: true },
  { title: "Physical Science", path: "/advanced-level/physical-science", group: "A/L Streams", description: "Physical Science full stream page", sectionEditor: true },
  { title: "Commerce", path: "/advanced-level/commerce", group: "A/L Streams", description: "Commerce full stream page", sectionEditor: true },
  { title: "Arts", path: "/advanced-level/arts", group: "A/L Streams", description: "Arts full stream page", sectionEditor: true },
  { title: "Exam Results", path: "/exam-results", group: "Academics", description: "Results, trends, honour roll and outcomes" },
  { title: "Achievements", path: "/achievements", group: "Academics", description: "College achievements, records and highlights" },
  { title: "Clubs & Societies", path: "/clubs-societies", group: "Co-Curricular", description: "Societies, participation and leadership" },
  { title: "Sports", path: "/sports", group: "Co-Curricular", description: "Sports disciplines, facilities, coaching and honours" },
  { title: "Cadeting", path: "/cadeting", group: "Co-Curricular", description: "Five uniformed units, values and honours" },
  { title: "Army Cadet Platoon", path: "/cadeting/army-cadet", group: "Cadet Units", description: "Army Cadet unit detail page" },
  { title: "Eastern Band", path: "/cadeting/eastern-band", group: "Cadet Units", description: "Eastern Band detail page" },
  { title: "Western Band", path: "/cadeting/western-band", group: "Cadet Units", description: "Western Band detail page" },
  { title: "Police Cadet", path: "/cadeting/police-cadet", group: "Cadet Units", description: "Police Cadet detail page" },
  { title: "Scouting", path: "/cadeting/scout-troop", group: "Cadet Units", description: "Scouting unit detail page" },
  { title: "News & Events", path: "/news", group: "Media", description: "News landing page and events section headings" },
  { title: "Campus Gallery", path: "/gallery", group: "Media", description: "Gallery landing page and archive headings" },
];
