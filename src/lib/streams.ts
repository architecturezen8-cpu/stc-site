import { PORTRAIT, SCENE } from "@/lib/media";

export type StreamTeacher = {
  name: string;
  role: string;
  subject: string;
  qualification: string;
  image: string;
};

export type StreamClass = {
  code: string;
  grade: string;
  strength: string;
  classTeacher: string;
  room: string;
};

export type StreamCourse = {
  university: string;
  course: string;
  faculty: string;
  zScore: string;
  highlight?: boolean;
};

export type StreamResource = {
  subject: string;
  items: string[];
};

export type StreamDownload = {
  title: string;
  type: string;
  size: string;
  href: string;
};

export type Stream = {
  slug: string;
  name: string;
  short: string;
  tagline: string;
  intake: string;
  about: string[];
  subjects: { name: string; detail: string; periods: string }[];
  stats: { value: string; label: string }[];
  teachers: StreamTeacher[];
  classes: StreamClass[];
  courses: StreamCourse[];
  resources: StreamResource[];
  downloads: StreamDownload[];
  building: {
    name: string;
    image: string;
    caption: string;
    facilities: string[];
  };
};

export const STREAMS: Stream[] = [
  {
    slug: "biological-science",
    name: "Biological Science",
    short: "Bio Science",
    tagline: "Medicine · Veterinary Science · Bio-Medical Research",
    intake: "2 classes · 60 students",
    about: [
      "The Biological Science stream at St. Thomas' College is the direct pathway to medicine, dental surgery, veterinary science, agriculture and bio-medical research. It remains the most competitive stream in the college, with places awarded on Ordinary Level results and a diagnostic term in Grade 12.",
      "Students sit three subjects — Biology, Chemistry and either Physics or Agro-Science — supported by two compulsory practical sessions every week in the life-science wing. Every student maintains a hand-written practical record book that is assessed termly, exactly as it will be at university.",
      "The stream runs a Grade 13 revision programme from January, including past-paper clinics on Saturday mornings and a medical faculty orientation visit to the University of Peradeniya each August.",
    ],
    subjects: [
      {
        name: "Biology",
        detail:
          "Cell biology, plant and animal form and function, genetics, ecology and evolution — with dissection and microscopy practicals.",
        periods: "10 periods / week",
      },
      {
        name: "Chemistry",
        detail:
          "Physical, inorganic and organic chemistry with titration, qualitative analysis and organic preparation laboratories.",
        periods: "10 periods / week",
      },
      {
        name: "Physics / Agro-Science",
        detail:
          "Mechanics, electricity, waves and modern physics — or applied agricultural science for students targeting agriculture faculties.",
        periods: "8 periods / week",
      },
    ],
    stats: [
      { value: "60", label: "Students on Roll" },
      { value: "98%", label: "University Qualified" },
      { value: "14", label: "Medical Faculty Entries" },
      { value: "6", label: "Subject Teachers" },
    ],
    teachers: [
      {
        name: "Dr. Ruwan Jayasuriya",
        role: "Head of Science",
        subject: "Biology",
        qualification: "PhD Molecular Biology, University of Colombo",
        image: PORTRAIT.man1,
      },
      {
        name: "Mrs. Niluka Senanayake",
        role: "Senior Teacher",
        subject: "Chemistry",
        qualification: "MSc Chemistry, University of Peradeniya",
        image: PORTRAIT.woman1,
      },
      {
        name: "Mr. Asanka Wijeratne",
        role: "Subject Teacher",
        subject: "Physics",
        qualification: "BSc (Hons) Physics, University of Kelaniya",
        image: PORTRAIT.man2,
      },
      {
        name: "Mr. Sarath Ekanayake",
        role: "Practical Coordinator",
        subject: "Agro-Science",
        qualification: "BSc Agriculture, Wayamba University",
        image: PORTRAIT.man3,
      },
    ],
    classes: [
      {
        code: "S1",
        grade: "Grade 12",
        strength: "30 students",
        classTeacher: "Mrs. Niluka Senanayake",
        room: "Science Wing · Room 204",
      },
      {
        code: "S2",
        grade: "Grade 12",
        strength: "30 students",
        classTeacher: "Mr. Asanka Wijeratne",
        room: "Science Wing · Room 205",
      },
      {
        code: "S3",
        grade: "Grade 13",
        strength: "29 students",
        classTeacher: "Dr. Ruwan Jayasuriya",
        room: "Science Wing · Room 301",
      },
      {
        code: "S4",
        grade: "Grade 13",
        strength: "28 students",
        classTeacher: "Mr. Sarath Ekanayake",
        room: "Science Wing · Room 302",
      },
    ],
    courses: [
      {
        university: "University of Colombo",
        course: "MBBS — Bachelor of Medicine & Surgery",
        faculty: "Faculty of Medicine",
        zScore: "Z 1.9321",
        highlight: true,
      },
      {
        university: "University of Peradeniya",
        course: "BVSc — Veterinary Science",
        faculty: "Faculty of Veterinary Medicine",
        zScore: "Z 1.7108",
        highlight: true,
      },
      {
        university: "University of Sri Jayewardenepura",
        course: "BDS — Dental Surgery",
        faculty: "Faculty of Dental Sciences",
        zScore: "Z 1.8042",
      },
      {
        university: "University of Peradeniya",
        course: "BSc Agricultural Technology & Management",
        faculty: "Faculty of Agriculture",
        zScore: "Z 1.4210",
      },
      {
        university: "University of Kelaniya",
        course: "BSc (Hons) Microbiology",
        faculty: "Faculty of Science",
        zScore: "Z 1.3655",
      },
      {
        university: "Rajarata University",
        course: "BSc Nursing",
        faculty: "Faculty of Allied Health Sciences",
        zScore: "Z 1.2894",
      },
    ],
    resources: [
      {
        subject: "Biology",
        items: [
          "Departmental resource book (Grades 12 & 13)",
          "Microscopy slide library — 180 prepared specimens",
          "Past papers 2010 – 2025 with marking schemes",
          "Dissection practical video archive",
        ],
      },
      {
        subject: "Chemistry",
        items: [
          "Titration and qualitative analysis workbook",
          "Organic reaction pathway charts",
          "Model paper series — 12 papers per year",
        ],
      },
      {
        subject: "Physics / Agro-Science",
        items: [
          "Practical record templates",
          "Formula handbook and derivation notes",
          "Field plot study guide (Agro-Science)",
        ],
      },
    ],
    downloads: [
      {
        title: "Biological Science — Syllabus Guide 2027",
        type: "PDF",
        size: "2.4 MB",
        href: "/contact?type=Academic",
      },
      {
        title: "Grade 12 Practical Record Template",
        type: "PDF",
        size: "840 KB",
        href: "/contact?type=Academic",
      },
      {
        title: "Past Paper Pack · 2020 – 2025",
        type: "ZIP",
        size: "18.6 MB",
        href: "/contact?type=Academic",
      },
      {
        title: "Revision Timetable — Grade 13",
        type: "PDF",
        size: "310 KB",
        href: "/contact?type=Academic",
      },
    ],
    building: {
      name: "The Life Science Wing",
      image: "/images/senior-school.jpg",
      caption:
        "The life-science wing houses two biology laboratories, a chemistry laboratory and the specimen museum.",
      facilities: [
        "2 Biology laboratories",
        "Chemistry laboratory with fume hoods",
        "Specimen & herbarium museum",
        "Seminar room with projector",
      ],
    },
  },
  {
    slug: "physical-science",
    name: "Physical Science",
    short: "Physical Science",
    tagline: "Engineering · Data Science · Architecture",
    intake: "3 classes · 90 students",
    about: [
      "The Physical Science stream is the largest at St. Thomas' College and the cohort behind our island-first mathematics results and the robotics championships of recent years. It leads to engineering, computer science, data science, physical science and architecture.",
      "Students sit Combined Mathematics, Physics and either Chemistry or Information & Communication Technology. Combined Mathematics is taught in two parallel sets by ability, allowing the pace to suit each group without separating the class socially.",
      "The stream maintains an open computer laboratory from 2.00 p.m. to 5.00 p.m. daily, where students complete ICT coursework, programming projects and the annual robotics build under supervision.",
    ],
    subjects: [
      {
        name: "Combined Mathematics",
        detail:
          "Pure mathematics — algebra, calculus, trigonometry — and applied mathematics covering statics, dynamics and statistics.",
        periods: "12 periods / week",
      },
      {
        name: "Physics",
        detail:
          "Mechanics, thermal physics, waves, electricity, electronics and modern physics with a weekly laboratory session.",
        periods: "10 periods / week",
      },
      {
        name: "Chemistry / ICT",
        detail:
          "Physical and organic chemistry — or Information & Communication Technology with programming, databases and networking.",
        periods: "8 periods / week",
      },
    ],
    stats: [
      { value: "90", label: "Students on Roll" },
      { value: "97%", label: "University Qualified" },
      { value: "21", label: "Engineering Entries" },
      { value: "7", label: "Subject Teachers" },
    ],
    teachers: [
      {
        name: "Mr. Lalith Gunasekara",
        role: "Head of Mathematics",
        subject: "Combined Mathematics",
        qualification: "MSc Applied Mathematics, University of Moratuwa",
        image: PORTRAIT.man4,
      },
      {
        name: "Mr. Dinesh Abeykoon",
        role: "Senior Teacher",
        subject: "Physics",
        qualification: "BSc (Hons) Engineering Physics, University of Colombo",
        image: PORTRAIT.man5,
      },
      {
        name: "Mrs. Chamari Rathnayake",
        role: "Subject Teacher",
        subject: "Chemistry",
        qualification: "MSc Analytical Chemistry, University of Peradeniya",
        image: PORTRAIT.woman2,
      },
      {
        name: "Mr. Kasun Herath",
        role: "ICT Coordinator",
        subject: "Information Technology",
        qualification: "BSc Computer Science, University of Moratuwa",
        image: PORTRAIT.man6,
      },
    ],
    classes: [
      {
        code: "M1",
        grade: "Grade 12",
        strength: "30 students",
        classTeacher: "Mr. Lalith Gunasekara",
        room: "Mathematics Block · Room 102",
      },
      {
        code: "M2",
        grade: "Grade 12",
        strength: "30 students",
        classTeacher: "Mr. Dinesh Abeykoon",
        room: "Mathematics Block · Room 103",
      },
      {
        code: "M3",
        grade: "Grade 12",
        strength: "30 students",
        classTeacher: "Mr. Kasun Herath",
        room: "ICT Laboratory · Room 110",
      },
      {
        code: "M4",
        grade: "Grade 13",
        strength: "29 students",
        classTeacher: "Mrs. Chamari Rathnayake",
        room: "Mathematics Block · Room 201",
      },
      {
        code: "M5",
        grade: "Grade 13",
        strength: "30 students",
        classTeacher: "Mr. Lalith Gunasekara",
        room: "Mathematics Block · Room 202",
      },
    ],
    courses: [
      {
        university: "University of Moratuwa",
        course: "BSc Engineering (Hons)",
        faculty: "Faculty of Engineering",
        zScore: "Z 1.8744",
        highlight: true,
      },
      {
        university: "University of Colombo School of Computing",
        course: "BSc (Hons) Computer Science",
        faculty: "UCSC",
        zScore: "Z 1.8012",
        highlight: true,
      },
      {
        university: "University of Moratuwa",
        course: "Bachelor of Architecture",
        faculty: "Faculty of Architecture",
        zScore: "Z 1.7320",
      },
      {
        university: "University of Peradeniya",
        course: "BSc Engineering (Hons)",
        faculty: "Faculty of Engineering",
        zScore: "Z 1.7985",
      },
      {
        university: "University of Sri Jayewardenepura",
        course: "BSc (Hons) Data Science",
        faculty: "Faculty of Applied Sciences",
        zScore: "Z 1.4126",
      },
      {
        university: "University of Ruhuna",
        course: "BSc (Hons) Physical Science",
        faculty: "Faculty of Science",
        zScore: "Z 1.2240",
      },
    ],
    resources: [
      {
        subject: "Combined Mathematics",
        items: [
          "Departmental tutorial series — 40 sheets",
          "Past papers 2008 – 2025 with full solutions",
          "Applied mathematics problem bank",
          "Weekly speed-test archive",
        ],
      },
      {
        subject: "Physics",
        items: [
          "Practical handbook with error analysis guide",
          "Electronics component kit for project work",
          "Model paper series — 10 papers per year",
        ],
      },
      {
        subject: "ICT",
        items: [
          "Python & Java programming workbooks",
          "Database design project briefs",
          "Open laboratory access · 2.00 – 5.00 p.m. daily",
        ],
      },
    ],
    downloads: [
      {
        title: "Physical Science — Syllabus Guide 2027",
        type: "PDF",
        size: "2.8 MB",
        href: "/contact?type=Academic",
      },
      {
        title: "Combined Mathematics Tutorial Pack",
        type: "PDF",
        size: "6.2 MB",
        href: "/contact?type=Academic",
      },
      {
        title: "Physics Practical Handbook",
        type: "PDF",
        size: "1.9 MB",
        href: "/contact?type=Academic",
      },
      {
        title: "ICT Project Brief · 2027 Intake",
        type: "DOCX",
        size: "480 KB",
        href: "/contact?type=Academic",
      },
    ],
    building: {
      name: "The Mathematics & ICT Block",
      image: "/images/clubs.jpg",
      caption:
        "The mathematics block and adjoining ICT laboratory, home to the robotics team and the open computer lab.",
      facilities: [
        "5 Mathematics classrooms",
        "Physics laboratory",
        "40-station ICT laboratory",
        "Robotics & electronics workshop",
      ],
    },
  },
  {
    slug: "commerce",
    name: "Commerce",
    short: "Commerce",
    tagline: "Accounting · Management · Economics",
    intake: "2 classes · 60 students",
    about: [
      "The Commerce stream is taught by chartered accountants and MBA holders, and prepares students for management, finance, accountancy and economics faculties — as well as for professional qualifications such as CA Sri Lanka and CIMA, which many students begin alongside their Advanced Levels.",
      "Students sit Accounting, Business Studies and Economics. Teaching is case-based: every term the cohort analyses a real Sri Lankan listed company, and in the third term runs the annual Student Market, a trading simulation in the Robinson Memorial Hall.",
      "The stream has produced national rankers consistently since 2009, and maintains an alumni mentoring circle of Old Thomians working in banking, audit and corporate finance.",
    ],
    subjects: [
      {
        name: "Accounting",
        detail:
          "Financial accounting, manufacturing accounts, partnership and company accounts, and management accounting fundamentals.",
        periods: "10 periods / week",
      },
      {
        name: "Business Studies",
        detail:
          "Management principles, marketing, human resources, operations and entrepreneurship with case-study analysis.",
        periods: "9 periods / week",
      },
      {
        name: "Economics",
        detail:
          "Micro and macroeconomics, the Sri Lankan economy, international trade and development economics.",
        periods: "9 periods / week",
      },
    ],
    stats: [
      { value: "60", label: "Students on Roll" },
      { value: "96%", label: "University Qualified" },
      { value: "11", label: "Management Faculty Entries" },
      { value: "5", label: "Subject Teachers" },
    ],
    teachers: [
      {
        name: "Mr. Priyantha Fernando",
        role: "Head of Commerce",
        subject: "Accounting",
        qualification: "FCA, Chartered Accountant · CA Sri Lanka",
        image: PORTRAIT.man7,
      },
      {
        name: "Mrs. Dilini Perera",
        role: "Senior Teacher",
        subject: "Business Studies",
        qualification: "MBA, Postgraduate Institute of Management",
        image: PORTRAIT.woman1,
      },
      {
        name: "Mr. Nuwan Dissanayake",
        role: "Subject Teacher",
        subject: "Economics",
        qualification: "MA Economics, University of Colombo",
        image: PORTRAIT.man8,
      },
    ],
    classes: [
      {
        code: "C1",
        grade: "Grade 12",
        strength: "30 students",
        classTeacher: "Mrs. Dilini Perera",
        room: "Commerce Block · Room 401",
      },
      {
        code: "C2",
        grade: "Grade 12",
        strength: "30 students",
        classTeacher: "Mr. Nuwan Dissanayake",
        room: "Commerce Block · Room 402",
      },
      {
        code: "C3",
        grade: "Grade 13",
        strength: "28 students",
        classTeacher: "Mr. Priyantha Fernando",
        room: "Commerce Block · Room 403",
      },
    ],
    courses: [
      {
        university: "University of Colombo",
        course: "BBA (Hons) Business Administration",
        faculty: "Faculty of Management & Finance",
        zScore: "Z 1.7855",
        highlight: true,
      },
      {
        university: "University of Sri Jayewardenepura",
        course: "BSc (Hons) Accounting",
        faculty: "Faculty of Management Studies & Commerce",
        zScore: "Z 1.8203",
        highlight: true,
      },
      {
        university: "University of Colombo",
        course: "BA (Hons) Economics",
        faculty: "Faculty of Arts",
        zScore: "Z 1.6104",
      },
      {
        university: "University of Kelaniya",
        course: "BBM (Hons) Marketing Management",
        faculty: "Faculty of Commerce & Management",
        zScore: "Z 1.5340",
      },
      {
        university: "University of Peradeniya",
        course: "BSc (Hons) Management",
        faculty: "Faculty of Management",
        zScore: "Z 1.5712",
      },
      {
        university: "Rajarata University",
        course: "BSc Business Information Systems",
        faculty: "Faculty of Management Studies",
        zScore: "Z 1.2065",
      },
    ],
    resources: [
      {
        subject: "Accounting",
        items: [
          "Double-entry workbook series",
          "Company accounts case pack — 15 listed firms",
          "Past papers 2010 – 2025 with model answers",
        ],
      },
      {
        subject: "Business Studies",
        items: [
          "Sri Lankan business case-study library",
          "Student Market trading simulation handbook",
          "Entrepreneurship project templates",
        ],
      },
      {
        subject: "Economics",
        items: [
          "Central Bank data workbook",
          "Graph and diagram practice sheets",
          "Essay structure and model answer guide",
        ],
      },
    ],
    downloads: [
      {
        title: "Commerce — Syllabus Guide 2027",
        type: "PDF",
        size: "2.1 MB",
        href: "/contact?type=Academic",
      },
      {
        title: "Accounting Workbook · Grade 12",
        type: "PDF",
        size: "4.4 MB",
        href: "/contact?type=Academic",
      },
      {
        title: "Business Case Study Pack",
        type: "ZIP",
        size: "9.8 MB",
        href: "/contact?type=Academic",
      },
      {
        title: "Economics Model Answers · 2025",
        type: "PDF",
        size: "1.2 MB",
        href: "/contact?type=Academic",
      },
    ],
    building: {
      name: "The Commerce Block",
      image: "/images/middle-school.jpg",
      caption:
        "The Commerce block, with its case-study rooms and the trading floor used for the annual Student Market.",
      facilities: [
        "3 Case-study classrooms",
        "Business resource library",
        "Trading simulation room",
        "Alumni mentoring lounge",
      ],
    },
  },
  {
    slug: "arts",
    name: "Arts",
    short: "Arts",
    tagline: "Law · Diplomacy · Journalism · Academia",
    intake: "1 class · 30 students",
    about: [
      "The Arts stream is the smallest and most intimate at St. Thomas' College — a single class of thirty, taught in seminar style around one table. It leads to law, diplomacy, journalism, teaching, translation and the social sciences.",
      "Students sit History, Political Science and either English Literature or Sinhala Literature. Every student writes and defends a long-form research essay in Grade 13, and the stream runs a model United Nations and a debating circle through the year.",
      "Small numbers mean nothing is anonymous: every essay is marked individually and returned in conference, and two island ranks have come from this room in a single year.",
    ],
    subjects: [
      {
        name: "History",
        detail:
          "Sri Lankan history from the Anuradhapura period, European history and world history since 1900, with source analysis.",
        periods: "9 periods / week",
      },
      {
        name: "Political Science",
        detail:
          "Political theory, comparative government, the Sri Lankan constitution and international relations.",
        periods: "9 periods / week",
      },
      {
        name: "English / Sinhala Literature",
        detail:
          "Prescribed poetry, drama and the novel, with critical essay writing and close textual analysis.",
        periods: "9 periods / week",
      },
    ],
    stats: [
      { value: "30", label: "Students on Roll" },
      { value: "99%", label: "University Qualified" },
      { value: "2", label: "Island Ranks · 2026" },
      { value: "4", label: "Subject Teachers" },
    ],
    teachers: [
      {
        name: "Mr. Jagath Weerasinghe",
        role: "Head of Humanities",
        subject: "History",
        qualification: "MA History, University of Peradeniya",
        image: PORTRAIT.man9,
      },
      {
        name: "Mrs. Shanika Bandara",
        role: "Senior Teacher",
        subject: "Political Science",
        qualification: "MA Political Science, University of Colombo",
        image: PORTRAIT.woman2,
      },
      {
        name: "Mr. Anton Rajapakse",
        role: "Subject Teacher",
        subject: "English Literature",
        qualification: "MA English, University of Kelaniya",
        image: PORTRAIT.man10,
      },
    ],
    classes: [
      {
        code: "A1",
        grade: "Grade 12",
        strength: "30 students",
        classTeacher: "Mrs. Shanika Bandara",
        room: "Humanities Wing · Seminar Room 1",
      },
      {
        code: "A2",
        grade: "Grade 13",
        strength: "28 students",
        classTeacher: "Mr. Jagath Weerasinghe",
        room: "Humanities Wing · Seminar Room 2",
      },
    ],
    courses: [
      {
        university: "University of Colombo",
        course: "LLB (Hons) Bachelor of Laws",
        faculty: "Faculty of Law",
        zScore: "Z 1.9012",
        highlight: true,
      },
      {
        university: "University of Peradeniya",
        course: "BA (Hons) International Relations",
        faculty: "Faculty of Arts",
        zScore: "Z 1.6480",
        highlight: true,
      },
      {
        university: "University of Kelaniya",
        course: "BA (Hons) Mass Communication",
        faculty: "Faculty of Social Sciences",
        zScore: "Z 1.5922",
      },
      {
        university: "University of Colombo",
        course: "BA (Hons) History",
        faculty: "Faculty of Arts",
        zScore: "Z 1.4015",
      },
      {
        university: "University of Sri Jayewardenepura",
        course: "BA (Hons) English",
        faculty: "Faculty of Humanities & Social Sciences",
        zScore: "Z 1.4703",
      },
      {
        university: "University of Ruhuna",
        course: "BA (Hons) Political Science",
        faculty: "Faculty of Humanities",
        zScore: "Z 1.1880",
      },
    ],
    resources: [
      {
        subject: "History",
        items: [
          "Primary source document pack",
          "Timeline and map atlas",
          "Essay plan library — 60 model plans",
        ],
      },
      {
        subject: "Political Science",
        items: [
          "Constitution annotated reader",
          "Model United Nations briefing papers",
          "Comparative government case notes",
        ],
      },
      {
        subject: "Literature",
        items: [
          "Prescribed text annotated editions",
          "Critical essay anthology",
          "Debating circle resource folder",
        ],
      },
    ],
    downloads: [
      {
        title: "Arts Stream — Syllabus Guide 2027",
        type: "PDF",
        size: "1.8 MB",
        href: "/contact?type=Academic",
      },
      {
        title: "History Source Document Pack",
        type: "PDF",
        size: "5.1 MB",
        href: "/contact?type=Academic",
      },
      {
        title: "Essay Writing & Structure Guide",
        type: "PDF",
        size: "720 KB",
        href: "/contact?type=Academic",
      },
      {
        title: "Model UN Briefing Papers · 2026",
        type: "ZIP",
        size: "3.3 MB",
        href: "/contact?type=Academic",
      },
    ],
    building: {
      name: "The Humanities Wing",
      image: SCENE.colonnade,
      caption:
        "The humanities wing, where the Arts stream meets in seminar rooms around a single table.",
      facilities: [
        "2 Seminar rooms",
        "Humanities reading library",
        "Debating & Model UN chamber",
        "Writing conference room",
      ],
    },
  },
];

export function getStream(slug: string) {
  return STREAMS.find((s) => s.slug === slug);
}
