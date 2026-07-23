// Student route group strings (guide 3.4: sentence case, one job per string,
// errors state what happened and what to do next). The failure line is the
// generic copy of guide 4.0: it never distinguishes wrong, revoked, or
// malformed, because the backend will not tell us and the copy should not
// pretend to know.
export const strings = {
  shell: {
    wordmark: "Tirocinium",
    // The seat number kept quietly present so a student always knows which
    // identity their work is filed under (guide 4.0). Never a name.
    seat: (seatNumber: string) => `Seat ${seatNumber}`,
  },
  enter: {
    title: "Enter your course",
    codeLabel: "Course code",
    action: "Enter course",
    failure: "That code did not work. Check it against the card from your professor.",
  },
  course: {
    // The resolve-into-course greeting by seat number (guide 4.0).
    greeting: (seatNumber: string, courseTitle: string) =>
      `Seat ${seatNumber}, welcome to ${courseTitle}.`,
    empty: "Your case studies will appear here as your professor publishes them.",
  },
} as const;
