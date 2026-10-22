/**
 * The college clubs & societies directory — shared between the public
 * Clubs & Societies page and the logo registry (every club crest is a
 * syncable logo identified by `club-crest-<slug>`).
 */
export type CollegeClub = {
  crest: string;
  name: string;
  members: string;
  day: string;
  note: string;
  founded: string;
};

export const COLLEGE_CLUBS: CollegeClub[] = [
  { crest: "DS", name: "Debating Society", members: "38 members", day: "Tue & Thu", note: "National champions 2026", founded: "1986" },
  { crest: "SS", name: "Science Society", members: "120 members", day: "Wednesday", note: "Science fair organisers", founded: "1978" },
  { crest: "RC", name: "Robotics & ICT Circle", members: "64 members", day: "Friday", note: "New lab, opened 2026", founded: "2016" },
  { crest: "CC", name: "Chess Circle", members: "52 members", day: "Mon & Wed", note: "U15 national champions", founded: "1992" },
  { crest: "DT", name: "Drama & Theatre", members: "80 members", day: "Thursday", note: "Annual Shakespeare production", founded: "1981" },
  { crest: "CH", name: "Choir & Classical Music", members: "95 members", day: "Daily, 7 a.m.", note: "All-island gold, 3rd consecutive year", founded: "1976" },
  { crest: "OR", name: "Orchestra", members: "46 members", day: "Wed & Sat", note: "Festival of Strings hosts", founded: "1994" },
  { crest: "PS", name: "Photography Society", members: "57 members", day: "Tuesday", note: "The college archive's keepers", founded: "2003" },
  { crest: "EC", name: "Environmental Circle", members: "110 members", day: "Alternate Fridays", note: "Campus reforestation programme", founded: "1998" },
  { crest: "CM", name: "Catholic Students' Movement", members: "150 members", day: "Monday", note: "The founding faith of the college", founded: "1875" },
  { crest: "UN", name: "Model United Nations", members: "42 members", day: "Friday", note: "CIMUN best delegation 2025", founded: "2008" },
  { crest: "SC", name: "3rd Matale Scout Troop", members: "94 members", day: "Saturday", note: "Founded 1935 · district champions", founded: "1935" },
];

/** Stable slug used for a club's crest visual key and logo registry key. */
export function clubSlug(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}
