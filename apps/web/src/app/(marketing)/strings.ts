// Marketing route group strings (frontend guide 3.4: every string lives in a
// typed strings module from day one; sentence case, one job per string). The
// tagline appears on the landing hero and nowhere inside the app shell.
export const strings = {
  wordmark: "Tirocinium",
  tagline: "Every problem, freshly ruled.",
  // The Roman story, told once here and never repeated inside the product
  // (frontend guide 3.1).
  story:
    "In Rome, you learned law by working cases beside a jurist. This is that, for your course.",
  // The two doors (decision 0073): addressed cards in the hero, one per
  // audience, each action named as the user does it.
  doors: "Ways in",
  enterCourse: "Enter course",
  signIn: "Sign in",
  signUp: "Create an account",
  studentDoorHeading: "Have a course code?",
  studentDoorBody:
    "Your professor gave you a card with a seat number and a code. That is all you need.",
  professorDoorHeading: "Teach with it",
  professorDoorBody:
    "Bring your own problems, keep every figure exactly as you drew it, and publish variants that never run dry.",
  // The practice loop, stated as the student does it (guide 4.1 and 4.2).
  practiceHeading: "How practice works",
  practiceStep1Title: "Start a fresh variant",
  practiceStep1Body:
    "Every attempt gets its own numbers, drawn from a pool your professor has already verified.",
  practiceStep2Title: "Work it on paper",
  practiceStep2Body:
    "Write the solution by hand and photograph your pages. The platform reads your handwriting, mathematics included.",
  practiceStep3Title: "Defend it out loud",
  practiceStep3Body:
    "A tutor that has read your work asks you to explain your reasoning, then names the one concept worth revisiting.",
  // The calm position of guide 4.2b, owned in one line.
  calm: "No streaks, no nudges, nothing infinite. The session ends when the work is done.",
  // Four plain claims for professors, each a tested product property.
  professorHeading: "Built for your course",
  professorImportTitle: "Import from PDF",
  professorImportBody:
    "Existing problem sets become editable case studies. Figures stay pixels from your original, never redrawn.",
  professorVariantsTitle: "Parameterized variants",
  professorVariantsBody:
    "Mark the values that may vary and publish. Every variant is solved independently before a student ever sees it.",
  professorSeatsTitle: "Seats, not accounts",
  professorSeatsBody:
    "Students enter with a code you hand out. The platform stores nothing about who they are.",
  professorPictureTitle: "An honest class picture",
  professorPictureBody:
    "Concept-level mastery with the evidence behind every label, and no ranking of students, by design.",
  closingLine: "Ready when you are.",
} as const;
