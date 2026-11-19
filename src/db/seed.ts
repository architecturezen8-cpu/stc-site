import { sql } from "drizzle-orm";
import { db } from "@/db";
import { events, galleryItems, posts, staff } from "@/db/schema";
import { ensureSchemaExtras } from "@/lib/schema-extras";

const postSeed = [
  {
    slug: "senior-science-team-all-island-champions",
    title: "Senior Science Team Crowned All-Island Champions",
    excerpt:
      "Our young innovators clinched first place at the All-Island Inter-School Science Fair with a solar-harvest project that stunned the judges.",
    body: [
      "For eleven months, a team of six senior students met every Thursday after the last bell — long after the corridors had emptied — to build something they believed could matter beyond a competition hall.",
      "Their entry, a low-cost solar-harvesting module designed for rural Sri Lankan households, took first place at the All-Island Inter-School Science Fair this month, defeating entries from one hundred and forty schools.",
      "The judging panel described the project as \"engineering of genuine social consequence, executed with a maturity well beyond school level.\" The module converts roughly forty percent more usable energy than comparable commercial units in its price bracket.",
      "What impressed the panel most, however, was not the physics. It was the fieldwork: the team spent two school holidays interviewing thirty farming families about how they actually use electricity, then redesigned their prototype three times in response.",
      "\"We stopped designing for the judges and started designing for those families,\" said team captain Dineth Perera. \"That changed everything.\"",
      "The team will now represent the college at the Asia-Pacific Young Innovators Summit in Singapore this coming March.",
    ].join("\n\n"),
    category: "Achievements",
    image: "/images/news-science.jpg",
    location: "Robinson Memorial Hall",
    author: "Dr. Ruwan Jayasuriya",
    readMinutes: 4,
    featured: true,
    publishedAt: new Date("2026-10-12T09:00:00"),
  },
  {
    slug: "battle-of-the-golds-returns",
    title: "The Battle of the Golds Returns This Month",
    excerpt:
      "The historic big match against Science College, Matale is back. Gates open at 8.00 a.m. — tickets are now available at the college office.",
    body: [
      "It is the biggest date on the Matale sporting calendar: St. Thomas' College against Science College, Matale — the Battle of the Golds.",
      "Our First XI arrives in strong form, having lost only one of eleven fixtures this season. The captain leads a side built around a disciplined bowling attack and a top order that has passed two hundred in four consecutive innings.",
      "Science College, unbeaten since August, will be no gentle visitor. Their opening pair has shared three century stands this season alone.",
      "Gates open at 8.00 a.m. on both days. Old Thomians are invited to the pavilion breakfast from 7.30 a.m., and the traditional papare band will lead the parade from the main gate at 9.15 a.m.",
      "Tickets are available at the college office. Proceeds from this year's match will fund the sports scholarship endowment, which currently supports nineteen students.",
    ].join("\n\n"),
    category: "Sports",
    image: "/images/news-sports.jpg",
    location: "College Cricket Grounds",
    author: "Mr. Asela Gunawardena",
    readMinutes: 3,
    featured: false,
    publishedAt: new Date("2026-10-24T08:30:00"),
  },
  {
    slug: "thomian-nite-evening-of-dance-drums-drama",
    title: "Thomian Nite: An Evening of Dance, Drums & Drama",
    excerpt:
      "The Old Thomians' Association presents an evening of dance, drums and drama, celebrating 153 years of the college.",
    body: [
      "Thomian Nite returns to Robinson Memorial Hall with the largest cast in the event's history: two hundred performers across eleven acts.",
      "The evening opens with the traditional drummers' invocation: five drummers, no amplification, and a hall that falls entirely silent.",
      "This year's programme includes a newly choreographed Kandyan sequence, a student-written one-act play on migration and memory, and a closing choral piece performed jointly by the junior and senior choirs.",
      "Rehearsals have run every evening since August. \"You can hear the drums from the Trinco Road at six o'clock,\" said cultural prefect Tharusha Silva. \"Neighbours have started bringing chairs.\"",
      "Doors open at 5.30 p.m. Entry is free for parents and Old Thomians; a limited number of public seats will be released one week prior.",
    ].join("\n\n"),
    category: "Culture",
    image: "/images/news-music.jpg",
    location: "Robinson Memorial Hall",
    author: "Mrs. Kumari Dissanayake",
    readMinutes: 3,
    featured: false,
    publishedAt: new Date("2026-11-08T17:30:00"),
  },
  {
    slug: "record-advanced-level-results-2026",
    title: "Record Advanced Level Results Place College Among Island's Best",
    excerpt:
      "Ninety-eight percent of our Advanced Level candidates qualified for university entrance, with fourteen island ranks across four streams.",
    body: [
      "The 2026 Advanced Level results confirm the strongest academic year in recent memory. Of 218 candidates, 214 qualified for university entrance — a rate of ninety-eight percent.",
      "Fourteen students placed within the island's top twenty in their respective streams, including first places in Biological Science, Physical Science and Commerce.",
      "Forty-one students achieved three A grades. The Physical Science stream recorded a district-best mean, and the Arts stream produced two island ranks.",
      "\"These numbers describe hard work, but they also describe teaching,\" said Principal Dhammika Hewawasam at the announcement assembly. \"Our staff gave up Saturdays for two years. That is the real headline.\"",
      "Career counselling sessions for university applications begin next week, with representatives from eleven local and overseas institutions visiting the college through December.",
    ].join("\n\n"),
    category: "Achievements",
    image: "/images/senior-school.jpg",
    location: "College Auditorium",
    author: "Dr. Ruwan Jayasuriya",
    readMinutes: 4,
    featured: false,
    publishedAt: new Date("2026-09-28T10:00:00"),
  },
  {
    slug: "new-robotics-lab-opens-middle-school",
    title: "New Robotics Laboratory Opens for Middle School",
    excerpt:
      "A purpose-built robotics and design laboratory opens its doors to grades six through nine, funded entirely by the Old Thomians' Association.",
    body: [
      "The new robotics and design laboratory on the ground floor of the Science Block opened this week, giving every middle school student timetabled access to prototyping equipment previously reserved for senior classes.",
      "The facility houses twenty workstations, six 3D printers, a laser cutter and a dedicated electronics bench. Funding was raised entirely by the Old Thomians' Association over two years.",
      "Middle school students will now complete a full design cycle each term — identify a problem, prototype, test, and present. The first cohort is building assistive devices for visually impaired students in the Matale district.",
      "\"Eleven-year-olds do not know what is supposed to be impossible,\" said Mrs. Shanika de Alwis, head of the design faculty. \"That is precisely why they should be in this room.\"",
      "An open evening for parents will be held at the end of the month.",
    ].join("\n\n"),
    category: "Announcements",
    image: "/images/middle-school.jpg",
    location: "Science Block, Ground Floor",
    author: "Mrs. Shanika de Alwis",
    readMinutes: 3,
    featured: false,
    publishedAt: new Date("2026-09-15T11:00:00"),
  },
  {
    slug: "athletics-squad-sweeps-provincial-meet",
    title: "Athletics Squad Sweeps Provincial Meet with Nine Golds",
    excerpt:
      "Our track and field athletes returned from the Central Province Championships with nine gold, six silver and four bronze medals.",
    body: [
      "The college athletics squad delivered its finest provincial performance in a decade at the Central Province Championships, finishing second overall on the points table among sixty-two competing schools.",
      "Nine gold medals came across sprints, middle distance, relays and field events. The under-19 4x100m relay team broke a provincial record that had stood since 2011.",
      "Particular mention goes to Nimesh Rajapaksa, who won both the 800m and 1500m within ninety minutes of each other, and to Kavindu Silva, whose javelin throw of 62.4 metres qualifies him for national selection trials.",
      "The squad trains at 5.30 a.m., six mornings a week, under head coach Mr. Priyantha Bandara. \"They earn this in the dark,\" he said. \"Nobody watches the mornings.\"",
      "National trials follow in January.",
    ].join("\n\n"),
    category: "Sports",
    image: "/images/sports.jpg",
    location: "Matale Public Grounds",
    author: "Mr. Asela Gunawardena",
    readMinutes: 3,
    featured: false,
    publishedAt: new Date("2026-08-30T16:00:00"),
  },
  {
    slug: "debating-society-wins-national-championship",
    title: "Debating Society Wins National Schools Championship",
    excerpt:
      "After four rounds and a final watched by six hundred, our senior debating team takes the national title.",
    body: [
      "The senior debating team won the National Schools Debating Championship at the BMICH in Colombo, defeating a formidable Kandy side in a final that ran past three hours.",
      "The winning motion — that developing nations should prioritise climate adaptation over mitigation — was argued in the negative, a position the team drew only thirty minutes before the round began.",
      "Team member Ashan Wickremesinghe was named best speaker of the tournament, the first time a student from our college has received the honour.",
      "The society meets twice weekly and is open to all students from grade nine upward. Thirty-eight students currently attend regularly — the highest membership in its history.",
      "\"Debating teaches you to argue a case you did not choose,\" said coach Mr. Lakshman Peiris. \"There is no better preparation for adult life.\"",
    ].join("\n\n"),
    category: "Achievements",
    image: "/images/clubs.jpg",
    location: "BMICH, Colombo",
    author: "Mr. Lakshman Peiris",
    readMinutes: 3,
    featured: false,
    publishedAt: new Date("2026-08-12T14:00:00"),
  },
  {
    slug: "robinson-memorial-hall-restoration-complete",
    title: "Robinson Memorial Hall Restoration Complete After Two Years",
    excerpt:
      "The 1901 hall reopens with restored timber, new archival storage and a study mezzanine seating a hundred and twenty.",
    body: [
      "Robinson Memorial Hall — built in 1901 on land donated by John Croos of Negombo and named for headmaster Charles Robinson — has reopened following a two-year restoration.",
      "Original timber shelving and flooring was stripped, repaired and refinished by hand. The tall windows, painted shut for decades, now open again, restoring the cross-ventilation the building was designed around.",
      "A new climate-controlled archive room houses the college's collection of records and the complete run of the college magazine since its first issue.",
      "A mezzanine level adds a hundred and twenty silent study seats, bringing total capacity to three hundred and forty.",
      "The hall now opens at 6.45 a.m. for students who travel long distances, and remains open until 6.00 p.m. on weekdays.",
    ].join("\n\n"),
    category: "Announcements",
    image: "/images/about.jpg",
    location: "Robinson Memorial Hall",
    author: "Mrs. Kumari Dissanayake",
    readMinutes: 3,
    featured: false,
    publishedAt: new Date("2026-07-20T09:30:00"),
  },
];

const eventSeed = [
  {
    title: "Annual Prize Giving 2026",
    description:
      "The college's formal recognition of academic, sporting and service excellence, with the chief guest address.",
    category: "Ceremony",
    startsAt: new Date("2026-12-05T16:00:00"),
    timeLabel: "4.00 p.m. – 7.00 p.m.",
    location: "College Auditorium",
  },
  {
    title: "Grade 6 Admission Interviews",
    description:
      "Interviews for the 2027 intake. Parents should arrive fifteen minutes before the allocated slot.",
    category: "Admissions",
    startsAt: new Date("2026-11-18T08:00:00"),
    timeLabel: "8.00 a.m. onwards",
    location: "Administration Block",
  },
  {
    title: "Thomian Nite Cultural Festival",
    description:
      "An evening of dance, drums and drama presented by the Old Thomians' Association.",
    category: "Culture",
    startsAt: new Date("2026-11-08T17:30:00"),
    timeLabel: "5.30 p.m. – 9.30 p.m.",
    location: "Robinson Memorial Hall",
  },
  {
    title: "Battle of the Golds",
    description:
      "Two days of big match cricket against Science College, Matale, with the Old Thomians' pavilion breakfast.",
    category: "Sports",
    startsAt: new Date("2026-10-24T08:00:00"),
    timeLabel: "Gates open 8.00 a.m.",
    location: "College Cricket Grounds",
  },
  {
    title: "Parent–Teacher Conference",
    description:
      "Term three progress meetings for grades six to eleven. Booking sheets are available with class teachers.",
    category: "Academic",
    startsAt: new Date("2026-11-29T09:00:00"),
    timeLabel: "9.00 a.m. – 1.00 p.m.",
    location: "Respective Classrooms",
  },
  {
    title: "Robotics Lab Open Evening",
    description:
      "Parents are invited to see the new design laboratory and the first middle school assistive-device projects.",
    category: "Academic",
    startsAt: new Date("2026-10-30T17:00:00"),
    timeLabel: "5.00 p.m. – 7.00 p.m.",
    location: "Science Block",
  },
  {
    title: "Colours Nite 2026",
    description:
      "The college's recognition of sporting excellence, organised with the support of the Old Thomians' Association.",
    category: "Ceremony",
    startsAt: new Date("2026-12-12T17:00:00"),
    timeLabel: "5.00 p.m. – 8.00 p.m.",
    location: "College Auditorium",
  },
  {
    title: "Old Thomians' Sports Festival",
    description:
      "The Matale Old Thomians' Association's annual sports festival for past and present students of the college.",
    category: "Sports",
    startsAt: new Date("2026-12-19T08:00:00"),
    timeLabel: "8.00 a.m. – 4.00 p.m.",
    location: "College Grounds",
  },
];

const gallerySeed = [
  {
    title: "Main Quadrangle at Golden Hour",
    category: "Campus",
    image: "/images/hero.jpg",
    caption:
      "Students moving across the central quadrangle beneath Robinson Memorial Hall during evening assembly dismissal.",
    year: "2026",
    location: "College Quadrangle",
    aspect: "landscape",
  },
  {
    title: "Robinson Memorial Hall Reading Room",
    category: "Campus",
    image: "/images/about.jpg",
    caption:
      "Morning quiet study hour in the restored reading room of the 1901 Robinson Memorial Hall.",
    year: "2026",
    location: "Robinson Memorial Hall",
    aspect: "landscape",
  },
  {
    title: "Senior Physics Research Laboratory",
    category: "Academics",
    image: "/images/news-science.jpg",
    caption:
      "Senior students calibrating the prototype solar-harvest module before the All-Island Science Fair.",
    year: "2026",
    location: "Science Block",
    aspect: "landscape",
  },
  {
    title: "Battle of the Golds — Big Match Cricket",
    category: "Sports",
    image: "/images/news-sports.jpg",
    caption:
      "First XI opening batsman driving through the covers under late afternoon floodlights.",
    year: "2026",
    location: "College Cricket Grounds",
    aspect: "landscape",
  },
  {
    title: "Thomian Nite Cultural Festival",
    category: "Arts & Culture",
    image: "/images/news-music.jpg",
    caption:
      "Lead performers at the Old Thomians' Association cultural evening in Robinson Memorial Hall.",
    year: "2026",
    location: "Robinson Memorial Hall",
    aspect: "landscape",
  },
  {
    title: "Middle School Collaborative Design",
    category: "Academics",
    image: "/images/middle-school.jpg",
    caption:
      "Grade 8 design cohort testing sensor arrays in the newly opened Robotics Laboratory.",
    year: "2026",
    location: "Robotics & Prototyping Lab",
    aspect: "landscape",
  },
  {
    title: "Advanced Chemistry Research Station",
    category: "Academics",
    image: "/images/senior-school.jpg",
    caption:
      "Advanced Level chemistry students preparing spectrophotometric solutions for organic analysis.",
    year: "2026",
    location: "Chemistry Lab 02",
    aspect: "landscape",
  },
  {
    title: "Central Province Athletics Meet",
    category: "Sports",
    image: "/images/sports.jpg",
    caption:
      "Under-19 400m relay runners crossing the line in record time at the Matale Public Grounds.",
    year: "2026",
    location: "Matale Public Grounds",
    aspect: "landscape",
  },
  {
    title: "Inter-School Debating Championship",
    category: "Arts & Culture",
    image: "/images/clubs.jpg",
    caption:
      "Senior Debating Society in final preparation before their national championship-winning round.",
    year: "2026",
    location: "BMICH, Colombo",
    aspect: "landscape",
  },
  {
    title: "Principal & Staff Convocation",
    category: "Campus",
    image: "/images/principal.jpg",
    caption:
      "Principal Dhammika Hewawasam delivering the Founders' Day address to the college.",
    year: "2026",
    location: "Robinson Memorial Hall",
    aspect: "portrait",
  },
  {
    title: "College Symphony Performance",
    category: "Arts & Culture",
    image:
      "https://images.pexels.com/photos/7095737/pexels-photo-7095737.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=627&w=1200",
    caption:
      "The College Orchestra performing at the annual festival of strings.",
    year: "2026",
    location: "College Auditorium",
    aspect: "landscape",
  },
  {
    title: "Historic Quadrangle Colonnade",
    category: "Campus",
    image:
      "https://images.pexels.com/photos/27238158/pexels-photo-27238158.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=627&w=1200",
    caption:
      "Architectural colonnades framing the inner courtyard where generations of Thomians have studied.",
    year: "2026",
    location: "Administration Quadrangle",
    aspect: "landscape",
  },
];

const staffSeed = [
  { name: "Mr. Dhammika Hewawasam", role: "Principal", department: "Leadership", qualification: "B.Sc (Peradeniya) · PGDE · Appointed 2020", featured: true, sortOrder: 1 },
  { name: "Mr. Roshan De Silva", role: "Deputy Principal — Academics", department: "Leadership", qualification: "M.Sc Physics (Peradeniya) · PGDE", featured: false, sortOrder: 2 },
  { name: "Mrs. Nadeesha Perera", role: "Deputy Principal — Student Affairs", department: "Leadership", qualification: "M.Ed · Diploma in Child Counselling", featured: false, sortOrder: 3 },
  { name: "Dr. Ruwan Jayasuriya", role: "Head of Science", department: "Science & ICT", qualification: "Ph.D Chemistry (Peradeniya)", featured: false, sortOrder: 10 },
  { name: "Mrs. Shanika de Alwis", role: "Head of Design & ICT", department: "Science & ICT", qualification: "M.Sc Information Technology", featured: false, sortOrder: 11 },
  { name: "Mr. Kasun Wickramasinghe", role: "Senior Teacher — Physics", department: "Science & ICT", qualification: "M.Sc Physics", featured: false, sortOrder: 12 },
  { name: "Mr. Chandana Amarasinghe", role: "Head of Mathematics", department: "Mathematics", qualification: "M.Sc Applied Mathematics (Peradeniya)", featured: false, sortOrder: 20 },
  { name: "Ms. Ishara Abeykoon", role: "Senior Teacher — Mathematics", department: "Mathematics", qualification: "B.Sc (Hons) Mathematics", featured: false, sortOrder: 21 },
  { name: "Mrs. Waruni Senanayake", role: "Head of English", department: "Languages & Humanities", qualification: "B.A (Hons) English · CELTA", featured: false, sortOrder: 30 },
  { name: "Mrs. Chandra Gunaratne", role: "Head of Sinhala & Classical Studies", department: "Languages & Humanities", qualification: "M.A Sinhala (Peradeniya)", featured: false, sortOrder: 31 },
  { name: "Mr. Lakshman Peiris", role: "Head of Humanities · Debate Coach", department: "Languages & Humanities", qualification: "M.A History", featured: false, sortOrder: 32 },
  { name: "Mr. Nimal R. Fernando", role: "Head of Commerce", department: "Commerce", qualification: "FCMA · MBA (Jayewardenepura)", featured: false, sortOrder: 40 },
  { name: "Mrs. Dilani Rajapaksa", role: "Head of Junior School", department: "Junior School", qualification: "B.Ed Primary Education", featured: false, sortOrder: 50 },
  { name: "Mr. Asela Gunawardena", role: "Director of Sports", department: "Sports & Cadeting", qualification: "Former Provincial Cricketer · ACC Level II", featured: false, sortOrder: 60 },
  { name: "Mr. Priyantha Bandara", role: "Head Coach — Athletics", department: "Sports & Cadeting", qualification: "National Coaching Level II", featured: false, sortOrder: 61 },
  { name: "Capt. Rohan Weerasekara", role: "Cadet Platoon Commander", department: "Sports & Cadeting", qualification: "Sri Lanka Army Reserve", featured: false, sortOrder: 62 },
  { name: "Mrs. Kumari Dissanayake", role: "Head of Fine Arts & Culture", department: "Arts & Culture", qualification: "BVA Visual Arts", featured: false, sortOrder: 70 },
  { name: "Mr. Sandun Jayathilake", role: "Director of Music & Choir", department: "Arts & Culture", qualification: "LTCL Trinity College London", featured: false, sortOrder: 71 },
];

let seeding: Promise<void> | null = null;

async function runSeed() {
  // Databases created before the newer content columns existed get them
  // added idempotently here (see src/lib/schema-extras.ts).
  await ensureSchemaExtras();

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(posts);

  if (count === 0) {
    await db.insert(posts).values(postSeed).onConflictDoNothing();
  }

  const [{ count: eventCount }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(events);

  if (eventCount === 0) {
    await db.insert(events).values(eventSeed);
  }

  const [{ count: galleryCount }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(galleryItems);

  if (galleryCount === 0) {
    await db.insert(galleryItems).values(gallerySeed);
  }

  const [{ count: staffCount }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(staff);

  if (staffCount === 0) {
    await db.insert(staff).values(staffSeed);
  }
}

/** Idempotent — safe to call on every request. */
export async function ensureSeed() {
  if (!seeding) {
    seeding = runSeed().catch((error) => {
      seeding = null;
      throw error;
    });
  }
  return seeding;
}
